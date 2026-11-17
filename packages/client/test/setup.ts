import { setArgonBounds } from "@repo/schema";

// The tests derive with t:1 m:8 (`setPasswordKekParams`); the schemas check what
// comes back from the server, the disk and export files against these bounds.
setArgonBounds({ tMin: 1, mMin: 8, mMultipleOf: 1 });
