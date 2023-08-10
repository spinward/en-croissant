use dashmap::{mapref::entry::Entry, DashMap};
use diesel::prelude::*;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, san::SanPlus, Bitboard, ByColor, Chess, Position, Setup};
use std::{path::PathBuf, sync::Mutex, time::Instant};

use crate::{
    db::{
        encoding::decode_move, get_db_or_create, get_material_count, get_pawn_home, models::*,
        normalize_games, schema::*, ConnectionOptions, MaterialCount,
    },
    AppState,
};

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct ExactData {
    pawn_home: u16,
    material: MaterialCount,
    position: Chess,
}

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct PartialData {
    // piece_counts: Vec<(Piece, u8)>,
    piece_positions: Setup,
    material: MaterialCount,
}

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub enum PositionQuery {
    Exact(ExactData),
    Partial(PartialData),
}

impl PositionQuery {
    pub fn from_fen(fen: &str) -> Result<PositionQuery, String> {
        let position: Chess = Fen::from_ascii(fen.as_bytes())
            .or(Err("Invalid fen"))?
            .into_position(shakmaty::CastlingMode::Standard)
            .or(Err("Invalid fen"))?;
        let pawn_home = get_pawn_home(position.board());
        let material = get_material_count(position.board());
        Ok(PositionQuery::Exact(ExactData {
            pawn_home,
            material,
            position,
        }))
    }
}

impl<'de> Deserialize<'de> for PositionQuery {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::Object(map) => {
                let type_ = map
                    .get("type")
                    .ok_or(serde::de::Error::custom("Missing key"))?;
                let value = map
                    .get("value")
                    .ok_or(serde::de::Error::custom("Missing key"))?;
                match type_.as_str().unwrap() {
                    "exact" => {
                        let fen = value.as_str().unwrap();
                        PositionQuery::from_fen(fen).map_err(serde::de::Error::custom)
                    }
                    "partial" => {
                        let fen = Fen::from_ascii(value.as_str().unwrap().as_bytes()).unwrap();
                        let setup = fen.into_setup();
                        let material = get_material_count(&setup.board);
                        Ok(PositionQuery::Partial(PartialData {
                            piece_positions: setup,
                            material,
                        }))
                    }
                    _ => Err(serde::de::Error::custom("Invalid key")),
                }
            }
            _ => Err(serde::de::Error::custom("Invalid value")),
        }
    }
}

impl PositionQuery {
    fn matches(&self, position: &Chess) -> bool {
        match self {
            PositionQuery::Exact(ref data) => data.position == *position,
            PositionQuery::Partial(ref data) => {
                let query_board = &data.piece_positions.board;
                let tested_board = position.board();

                is_contained(tested_board.white(), query_board.white())
                    && is_contained(tested_board.black(), query_board.black())
                    && is_contained(tested_board.pawns(), query_board.pawns())
                    && is_contained(tested_board.knights(), query_board.knights())
                    && is_contained(tested_board.bishops(), query_board.bishops())
                    && is_contained(tested_board.rooks(), query_board.rooks())
                    && is_contained(tested_board.queens(), query_board.queens())
                    && is_contained(tested_board.kings(), query_board.kings())
            }
        }
    }

    fn is_reachable(&self, material: &MaterialCount, pawn_home: u16, reverse: bool) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                if reverse {
                    is_end_reachable(pawn_home, data.pawn_home)
                        && is_material_reachable(material, &data.material)
                } else {
                    is_end_reachable(data.pawn_home, pawn_home)
                        && is_material_reachable(&data.material, material)
                }
            }
            PositionQuery::Partial(ref data) => {
                if reverse {
                    is_material_reachable(material, &data.material)
                } else {
                    is_material_reachable(&data.material, material)
                }
            }
        }
    }
}

/// Returns true if the end pawn structure is reachable
fn is_end_reachable(end: u16, pos: u16) -> bool {
    end & !pos == 0
}

fn is_material_reachable(end: &MaterialCount, pos: &MaterialCount) -> bool {
    end.white <= pos.white && end.black <= pos.black
}

fn is_contained(container: Bitboard, subset: Bitboard) -> bool {
    container & subset == subset
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PositionStats {
    #[serde(rename = "move")]
    pub move_: String,
    pub white: i32,
    pub draw: i32,
    pub black: i32,
}

fn get_move_after_match(
    move_blob: &Vec<u8>,
    query: &PositionQuery,
) -> Result<Option<String>, String> {
    let mut chess = Chess::default();

    if query.matches(&chess) {
        if move_blob.is_empty() {
            return Ok(Some("*".to_string()));
        }
        let next_move = decode_move(move_blob[0], &chess).unwrap();
        let san = SanPlus::from_move(chess, &next_move);
        return Ok(Some(san.to_string()));
    }

    for (i, byte) in move_blob.iter().enumerate() {
        let m = decode_move(*byte, &chess).unwrap();
        chess.play_unchecked(&m);
        let board = chess.board();
        if !query.is_reachable(&get_material_count(board), get_pawn_home(board), false) {
            return Ok(None);
        }
        if query.matches(&chess) {
            if i == move_blob.len() - 1 {
                return Ok(Some("*".to_string()));
            }
            let next_move = decode_move(move_blob[i + 1], &chess).unwrap();
            let san = SanPlus::from_move(chess, &next_move);
            return Ok(Some(san.to_string()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn search_position(
    file: PathBuf,
    query: PositionQuery,
    state: tauri::State<'_, AppState>,
) -> Result<(Vec<PositionStats>, Vec<NormalizedGame>), String> {
    dbg!(&query);
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
        return Ok(pos.clone());
    }

    // start counting the time
    let start = Instant::now();
    println!("start: {:?}", start.elapsed());

    let permit = state.new_request.acquire().await.unwrap();
    let mut games = state.db_cache.lock().unwrap();

    if games.is_empty() {
        *games = games::table
            .select((
                games::id,
                games::result,
                games::moves,
                games::pawn_home,
                games::white_material,
                games::black_material,
            ))
            .load(db)
            .expect("load games");

        println!("got {} games: {:?}", games.len(), start.elapsed());
    }

    let openings: DashMap<String, PositionStats> = DashMap::new();
    let sample_games: Mutex<Vec<i32>> = Mutex::new(Vec::new());

    games.par_iter().for_each(
        |(id, result, game, end_pawn_home, white_material, black_material)| {
            if state.new_request.available_permits() == 0 {
                return;
            }
            let end_material: MaterialCount = ByColor {
                white: *white_material as u8,
                black: *black_material as u8,
            };
            if query.is_reachable(&end_material, *end_pawn_home as u16, true) {
                if let Ok(Some(m)) = get_move_after_match(game, &query) {
                    if sample_games.lock().unwrap().len() < 10 {
                        sample_games.lock().unwrap().push(*id);
                    }
                    let entry = openings.entry(m);
                    match entry {
                        Entry::Occupied(mut e) => {
                            let opening = e.get_mut();
                            match result.as_deref() {
                                Some("1-0") => opening.white += 1,
                                Some("0-1") => opening.black += 1,
                                Some("1/2-1/2") => opening.draw += 1,
                                _ => (),
                            }
                        }
                        Entry::Vacant(e) => {
                            let mut opening = PositionStats {
                                black: 0,
                                white: 0,
                                draw: 0,
                                move_: e.key().to_string(),
                            };
                            match result.as_deref() {
                                Some("1-0") => opening.white = 1,
                                Some("0-1") => opening.black = 1,
                                Some("1/2-1/2") => opening.draw = 1,
                                _ => (),
                            }
                            e.insert(opening);
                        }
                    }
                }
            }
        },
    );
    println!("done: {:?}", start.elapsed());
    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err("Search stopped".to_string());
    }

    let ids: Vec<i32> = sample_games.lock().unwrap().clone();

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let games: Vec<(Game, Player, Player, Event, Site)> = games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .filter(games::id.eq_any(ids))
        .load(db)
        .expect("load games");
    let normalized_games = normalize_games(games);

    let openings: Vec<PositionStats> = openings.into_iter().map(|(_, v)| v).collect();

    state
        .line_cache
        .insert((query, file), (openings.clone(), normalized_games.clone()));

    Ok((openings, normalized_games))
}

pub async fn is_position_in_db(
    file: PathBuf,
    query: PositionQuery,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
        return Ok(!pos.0.is_empty());
    }

    // start counting the time
    let start = Instant::now();
    println!("start: {:?}", start.elapsed());

    let permit = state.new_request.acquire().await.unwrap();
    let mut games = state.db_cache.lock().unwrap();

    if games.is_empty() {
        *games = games::table
            .select((
                games::id,
                games::result,
                games::moves,
                games::pawn_home,
                games::white_material,
                games::black_material,
            ))
            .load(db)
            .expect("load games");

        println!("got {} games: {:?}", games.len(), start.elapsed());
    }

    let exists = games.par_iter().any(
        |(_id, _result, game, end_pawn_home, white_material, black_material)| {
            if state.new_request.available_permits() == 0 {
                return false;
            }
            let end_material: MaterialCount = ByColor {
                white: *white_material as u8,
                black: *black_material as u8,
            };
            query.is_reachable(&end_material, *end_pawn_home as u16, true)
                && get_move_after_match(game, &query).unwrap_or(None).is_some()
        },
    );
    println!("done: {:?}", start.elapsed());
    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err("Search stopped".to_string());
    }

    if !exists {
        state.line_cache.insert((query, file), (vec![], vec![]));
    }

    drop(permit);
    Ok(exists)
}