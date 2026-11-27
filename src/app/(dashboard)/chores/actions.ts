// This file used to hold 20 server actions in a single 1,482-line
// module. Batch 3 of the refactor initiative split them into
// concern-based sub-files under `./_actions/` so each concern can
// be reviewed + tested in isolation. This file is now a re-export
// barrel so every existing call site keeps working unchanged.
//
// Note: this barrel intentionally does NOT carry the "use server"
// directive. Next.js 16 + Turbopack rejects non-async-function
// exports in a "use server" file, which would break `export { ... }
// from "./sub"` re-exports. Each sub-file under `_actions/` still
// has "use server" at the top, so every function below IS a server
// action — Next.js tracks the underlying function's directive, not
// the intermediate re-export path.
//
// - templates.ts  — chore template CRUD, tasks, schedule, room exclusions
// - rotations.ts  — create rotation, assign/unassign chore, rotateSchedule
// - signoffs.ts   — markSignoffComplete, reviewSignoff, overrideSignoffStatus,
//                   redoSignoff, completeChore (resident-facing)
// - exclusions.ts — resident-chore exclusions
// - photo.ts      — uploadChorePhoto

export {
  createChore,
  updateChore,
  archiveChore,
  addChoreTask,
  updateChoreTask,
  removeChoreTask,
  setChoreRoomExclusions,
  updateChoreSchedule,
} from "./_actions/templates";

export {
  createRotation,
  assignRotationChore,
  unassignRotationChore,
  rotateSchedule,
} from "./_actions/rotations";

export {
  markSignoffComplete,
  reviewSignoff,
  overrideSignoffStatus,
  redoSignoff,
  completeChore,
} from "./_actions/signoffs";

export {
  addChoreExclusion,
  removeChoreExclusion,
} from "./_actions/exclusions";

export { uploadChorePhoto } from "./_actions/photo";
