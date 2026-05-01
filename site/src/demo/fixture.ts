import type { AppState, Stack, Task } from "@app/types";

const now = Date.now();
let seq = 0;
const id = () => `fixture-${++seq}`;
const ago = (minutes: number) => now - minutes * 60_000;

function task(
  text: string,
  done: boolean,
  children: Task[] = [],
  opts: { habit?: boolean } = {},
): Task {
  return {
    id: id(),
    text,
    done,
    children,
    createdAt: ago(seq * 10),
    ...(opts.habit ? { habit: true } : {}),
  };
}

const morningRoutine: Stack = {
  id: id(),
  name: "Morning routine",
  createdAt: ago(2000),
  tasks: [
    task("Make coffee", true),
    task(
      "Exercise",
      false,
      [
        task("Stretch", true),
        task("Run", false),
      ],
      { habit: true },
    ),
    task("Review calendar", false),
    task("Empty inbox", true),
  ],
};

const homeReno: Stack = {
  id: id(),
  name: "Home renovation",
  createdAt: ago(1500),
  tasks: [
    task("Kitchen", false, [
      task("Pick paint color", true),
      task("Order cabinet handles", false),
      task("Schedule electrician", false),
    ]),
    task("Fix leaky faucet", true),
    task("Organize garage", false),
  ],
};

const tripJapan: Stack = {
  id: id(),
  name: "Trip to Japan",
  createdAt: ago(1000),
  tasks: [
    task("Book flights", false),
    task("Apply for visa", true),
    task("Accommodation", false, [
      task("Tokyo — first 3 nights", true),
      task("Kyoto — 2 nights", false),
      task("Osaka — 2 nights", false),
    ]),
    task("Buy pocket wifi", false),
  ],
};

const stacks = [morningRoutine, homeReno, tripJapan];

export function fixtureState(): AppState {
  return {
    stacks,
    activeStackId: morningRoutine.id,
    selectedTaskId: morningRoutine.tasks[1].id, // Exercise
    stackViewSize: null,
    lastHabitResetDate: null,
    pinned: false,
    editing: null,
    confirming: null,
    settingsTab: "keybindings",
    overrides: {},
    registrationOutcomes: [],
    presented: "main",
    portal: null,
  };
}
