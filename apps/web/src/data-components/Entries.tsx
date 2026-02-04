import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense } from "react";
import { Link, useRoute } from "wouter";
import { entrySlug } from "../data/routes";
import { TiUserOutline } from "react-icons/ti";
import { cn } from "../utils/tailwind";

type EntriesListProps = {
  entryId?: string;
};

function EntriesList({ entryId }: EntriesListProps) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.all.queryOptions());

  return (
    <ul className="">
      {data.entries.map(({ id, title, username }) => {
        const active = id === entryId;

        return (
          <li key={id} className="border-b">
            <Link
              className={cn(
                "grid w-full cursor-pointer grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-4 p-2 text-left",
                "hover:bg-surface-2",
                active && "bg-surface-2",
              )}
              to={`../${entrySlug}/${id}`}
            >
              <TiUserOutline className="bg-gradient row-span-2 h-12 w-12 rounded-lg p-2" />

              <span>{title}</span>
              <small>{username}</small>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Entries() {
  const [_, params] = useRoute(`/${entrySlug}/:entryId`);

  return (
    <Suspense fallback={<p>No Data</p>}>
      <EntriesList entryId={params?.entryId} />
    </Suspense>
  );
}
