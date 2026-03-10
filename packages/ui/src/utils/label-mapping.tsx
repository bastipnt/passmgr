// TODO: deprecated remove

import type { ReactElement } from "react";
import { TiDocument, TiMail } from "react-icons/ti";

type LabelMap = { Icon: ReactElement; label: string };

export const labelMap: Record<string, LabelMap> = {
  email: { Icon: <TiMail />, label: "Email" },
};

export const getAttrsForName = (name: string): LabelMap =>
  labelMap[name] ?? { Icon: <TiDocument />, label: name };
