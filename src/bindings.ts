         // This file was generated by [tauri-specta](https://github.com/oscartbeaumont/tauri-specta). Do not edit this file manually.

         export const commands = {
async closeSplashscreen() : Promise<null> {
return await TAURI_INVOKE("plugin:tauri-specta|close_splashscreen");
},
async findFidePlayer(player: string) : Promise<__Result__<{ fideid: number; name: string; country: string; sex: string; title: string | null; w_title: string | null; o_title: string | null; foa_title: string | null; rating: number | null; games: number | null; k: number | null; rapid_rating: number | null; rapid_games: number | null; rapid_k: number | null; blitz_rating: number | null; blitz_games: number | null; blitz_k: number | null; birthday: number | null; flag: string | null } | null, string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|find_fide_player", { player }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async getBestMoves(engine: string, tab: string, goMode: GoMode, options: EngineOptions) : Promise<__Result__<{ depth: number; score: Score; uciMoves: string[]; sanMoves: string[]; multipv: number; nps: number }[] | null, string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|get_best_moves", { engine, tab, goMode, options }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async analyzeGame(moves: string[], engine: string, goMode: GoMode, options: AnalysisOptions) : Promise<__Result__<{ best: BestMoves[]; novelty: boolean; maybe_brilliant: boolean }[], string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|analyze_game", { moves, engine, goMode, options }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async stopEngine(engine: string, tab: string) : Promise<__Result__<null, string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|stop_engine", { engine, tab }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async killEngines(tab: string) : Promise<__Result__<null, string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|kill_engines", { tab }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async getEngineLogs(engine: string, tab: string) : Promise<__Result__<({ type: "gui"; value: string } | { type: "engine"; value: string })[], string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|get_engine_logs", { engine, tab }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
},
async memorySize() : Promise<number> {
return await TAURI_INVOKE("plugin:tauri-specta|memory_size");
},
async getPuzzle(file: string, minRating: number, maxRating: number) : Promise<__Result__<{ id: number; fen: string; moves: string; rating: number; rating_deviation: number; popularity: number; nb_plays: number }, string>> {
try {
    return { status: "ok", data: await TAURI_INVOKE("plugin:tauri-specta|get_puzzle", { file, minRating, maxRating }) };
} catch (e) {
    if(e instanceof Error) throw e;
    else return { status: "error", error: e  as any };
}
}
}

export const events = __makeEvents__<{
bestMovesPayload: BestMovesPayload
}>({
bestMovesPayload: "plugin:tauri-specta:best-moves-payload"
})

/** user-defined types **/

export type AnalysisOptions = { fen: string; annotateNovelties: boolean; referenceDb: string | null; reversed: boolean }
export type BestMoves = { depth: number; score: Score; uciMoves: string[]; sanMoves: string[]; multipv: number; nps: number }
export type BestMovesPayload = { bestLines: BestMoves[]; engine: string; tab: string }
export type EngineOption = { name: string; value: string }
export type EngineOptions = { multipv: number; threads: number; hash: number; fen: string; extraOptions: EngineOption[] }
export type GoMode = { t: "Depth"; c: number } | { t: "Time"; c: number } | { t: "Nodes"; c: number } | { t: "Infinite" }
export type Score = { type: "cp"; value: number } | { type: "mate"; value: number }

/** tauri-specta globals **/

         import { invoke as TAURI_INVOKE } from "@tauri-apps/api";
import * as TAURI_API_EVENT from "@tauri-apps/api/event";
import { type WebviewWindowHandle as __WebviewWindowHandle__ } from "@tauri-apps/api/window";

type __EventObj__<T> = {
  listen: (
    cb: TAURI_API_EVENT.EventCallback<T>
  ) => ReturnType<typeof TAURI_API_EVENT.listen<T>>;
  once: (
    cb: TAURI_API_EVENT.EventCallback<T>
  ) => ReturnType<typeof TAURI_API_EVENT.once<T>>;
  emit: T extends null
    ? (payload?: T) => ReturnType<typeof TAURI_API_EVENT.emit>
    : (payload: T) => ReturnType<typeof TAURI_API_EVENT.emit>;
};

type __Result__<T, E> =
  | { status: "ok"; data: T }
  | { status: "error"; error: E };

function __makeEvents__<T extends Record<string, any>>(
  mappings: Record<keyof T, string>
) {
  return new Proxy(
    {} as unknown as {
      [K in keyof T]: __EventObj__<T[K]> & {
        (handle: __WebviewWindowHandle__): __EventObj__<T[K]>;
      };
    },
    {
      get: (_, event) => {
        const name = mappings[event as keyof T];

        return new Proxy((() => {}) as any, {
          apply: (_, __, [window]: [__WebviewWindowHandle__]) => ({
            listen: (arg: any) => window.listen(name, arg),
            once: (arg: any) => window.once(name, arg),
            emit: (arg: any) => window.emit(name, arg),
          }),
          get: (_, command: keyof __EventObj__<any>) => {
            switch (command) {
              case "listen":
                return (arg: any) => TAURI_API_EVENT.listen(name, arg);
              case "once":
                return (arg: any) => TAURI_API_EVENT.once(name, arg);
              case "emit":
                return (arg: any) => TAURI_API_EVENT.emit(name, arg);
            }
          },
        });
      },
    }
  );
}

     