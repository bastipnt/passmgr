import { CardDescription, CardHeader, CardTitle } from "@repo/ui/components/Card";
import type { ReactNode } from "react";

/** An auth card's headline: the page title on a phone, where the card is flat. */
export default function AuthCardHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <CardHeader>
      <CardTitle className="max-sm:font-extrabold max-sm:text-4xl max-sm:tracking-[-0.035em]">
        {title}
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
  );
}
