import type { Entry } from "@repo/client";
import type { ReactElement } from "react";
import type { Path } from "react-hook-form";
import { TiDocument, TiMail } from "react-icons/ti";

export const labelMap: Record<string, { Icon: ReactElement; label: string }> = {
  email: { Icon: <TiMail />, label: "Email" },
};

export const getAttrsForName = (name: string) =>
  name in labelMap ? labelMap[name] : { Icon: <TiDocument />, label: name };

const excludedKeys = ["name", "id"];

// export function getInputsFromData<T extends Record<string, string>>(data: Entry[]): { name: keyof Entry }[] {
//   return Object.keys(data)
//     .filter((key) => !excludedKeys.includes(key))
//     .map((key) => ({
//       name: key as Path<T>,
//     }));
// }
