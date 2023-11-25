import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Portal,
  RangeSlider,
  SimpleGrid,
  Text,
  Tooltip,
  createStyles,
} from "@mantine/core";
import { useLocalStorage, useSessionStorage } from "@mantine/hooks";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { unwrap } from "@/utils/invoke";
import {
  Completion,
  Puzzle,
  PuzzleDatabase,
  getPuzzleDatabases,
} from "@/utils/puzzles";
import PuzzleBoard from "./PuzzleBoard";
import { PuzzleDbCard } from "./PuzzleDbCard";
import AddPuzzle from "./AddPuzzle";
import ChallengeHistory from "../common/ChallengeHistory";
import { commands } from "@/bindings";

const useStyles = createStyles((theme) => ({
  card: {
    cursor: "pointer",
    border: 0,
    backgroundColor:
      theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.white,

    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[6]
          : theme.colors.gray[0],
    },
  },
}));

function Puzzles({ id }: { id: string }) {
  const [puzzles, setPuzzles] = useSessionStorage<Puzzle[]>({
    key: id,
    defaultValue: [],
  });
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [currentMove, setCurrentMove] = useState(1);

  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useLocalStorage<string | null>({
    key: "puzzle-db",
    defaultValue: null,
  });
  useEffect(() => {
    getPuzzleDatabases().then((databases) => {
      setPuzzleDbs(databases);
    });
  }, []);

  const [ratingRange, setRatingRange] = useLocalStorage<[number, number]>({
    key: "puzzle-ratings",
    defaultValue: [1000, 1500],
  });

  const wonPuzzles = puzzles.filter(
    (puzzle) => puzzle.completion === "correct"
  );
  const lostPuzzles = puzzles.filter(
    (puzzle) => puzzle.completion === "incorrect"
  );
  const averageWonRating =
    wonPuzzles.reduce((acc, puzzle) => acc + puzzle.rating, 0) /
    wonPuzzles.length;
  const averageLostRating =
    lostPuzzles.reduce((acc, puzzle) => acc + puzzle.rating, 0) /
    lostPuzzles.length;

  function generatePuzzle(db: string) {
    commands.getPuzzle(db, ratingRange[0], ratingRange[1]).then((res) => {
      const puzzle = unwrap(res);
      setPuzzles((puzzles) => {
        return [
          ...puzzles,
          {
            ...puzzle,
            moves: puzzle.moves.split(" "),
            completion: "incomplete",
          },
        ];
      });
      setCurrentPuzzle(puzzles.length);
      setCurrentMove(1);
    });
  }

  function changeCompletion(completion: Completion) {
    setPuzzles((puzzles) => {
      puzzles[currentPuzzle].completion = completion;
      return [...puzzles];
    });
  }

  const [tmpSelected, setTmpSelected] = useState<string | null>(null);
  const [addOpened, setAddOpened] = useState(false);
  const [loading, setLoading] = useState(false);

  const { classes } = useStyles();

  return (
    <>
      <Portal target="#left" style={{ height: "100%" }}>
        <PuzzleBoard
          key={currentPuzzle}
          puzzles={puzzles}
          currentPuzzle={currentPuzzle}
          changeCompletion={changeCompletion}
          generatePuzzle={generatePuzzle}
          currentMove={currentMove}
          setCurrentMove={setCurrentMove}
          db={selectedDb}
        />
      </Portal>
      <Portal target="#topRight" style={{ height: "100%" }}>
        <Card h="100%">
          <AddPuzzle
            puzzleDbs={puzzleDbs}
            opened={addOpened}
            setOpened={setAddOpened}
            setLoading={setLoading}
            setPuzzleDbs={setPuzzleDbs}
          />
          <SimpleGrid cols={2} mb="md">
            {puzzleDbs.map((db) => (
              <PuzzleDbCard
                key={db.path}
                db={db}
                isSelected={tmpSelected === db.path}
                setSelected={setTmpSelected}
              />
            ))}
            <Card
              withBorder
              radius="md"
              className={classes.card}
              component="button"
              type="button"
              onClick={() => setAddOpened(true)}
            >
              <Text weight={500} mb={10}>
                Add New
              </Text>
              {loading ? (
                <Loader variant="dots" size="2rem" />
              ) : (
                <IconPlus size="2rem" />
              )}
            </Card>
          </SimpleGrid>
          <Group>
            <div>
              <Text size="sm" color="dimmed">
                Puzzle Rating
              </Text>
              <Text weight={500} size="xl">
                {puzzles[currentPuzzle]?.rating}
              </Text>
            </div>
            {averageWonRating && (
              <div>
                <Text size="sm" color="dimmed">
                  Average Won Rating
                </Text>
                <Text weight={500} size="xl">
                  {averageWonRating.toFixed(0)}
                </Text>
              </div>
            )}
            {averageLostRating && (
              <div>
                <Text size="sm" color="dimmed">
                  Average Lost Rating
                </Text>
                <Text weight={500} size="xl">
                  {averageLostRating.toFixed(0)}
                </Text>
              </div>
            )}
          </Group>
          <Divider my="sm" />
          <Text>Rating Range</Text>
          <RangeSlider
            min={600}
            max={2800}
            value={ratingRange}
            onChange={setRatingRange}
          />
          <Divider my="sm" />
          <Group>
            <Tooltip label="New Puzzle">
              <ActionIcon
                disabled={!selectedDb}
                onClick={() => generatePuzzle(selectedDb!)}
              >
                <IconPlus />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Clear Session">
              <ActionIcon
                onClick={() => {
                  setPuzzles([]);
                  setSelectedDb(null);
                }}
              >
                <IconX />
              </ActionIcon>
            </Tooltip>
            <Button
              onClick={async () => {
                const curPuzzle = puzzles[currentPuzzle];
                if (curPuzzle.completion === "incomplete") {
                  changeCompletion("incorrect");
                }
                for (let i = currentMove; i < curPuzzle.moves.length; i++) {
                  setCurrentMove((currentMove) => currentMove + 1);
                  await new Promise((r) => setTimeout(r, 500));
                }
              }}
              disabled={
                puzzles.length === 0 ||
                currentMove === puzzles[currentPuzzle].moves.length
              }
            >
              View Solution
            </Button>
          </Group>
        </Card>
      </Portal>
      <Portal target="#bottomRight" style={{ height: "100%" }}>
        <Card h="100%">
          <Text mb="md">Puzzles</Text>
          <ChallengeHistory
            challenges={puzzles}
            current={currentPuzzle}
            select={(i) => {
              setCurrentPuzzle(i);
              setCurrentMove(1);
            }}
          />
        </Card>
      </Portal>
    </>
  );
}

export default Puzzles;
