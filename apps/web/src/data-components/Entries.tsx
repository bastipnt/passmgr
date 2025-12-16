import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense } from "react";
import { Link } from "wouter";
import { entrySlug } from "../data/routes";
import { TiUserOutline } from "react-icons/ti";
import { cn } from "../utils/tailwind";

function EntriesList() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.all.queryOptions());

  return (
    <ul className="space-y-2 p-2">
      {data.entries.map(({ name, id, email }) => (
        <li key={id}>
          <Link
            className={cn(
              "bg-surface-3 grid w-full cursor-pointer grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-2 rounded p-2 text-left",
              "hover:bg-primary-100/20",
            )}
            to={`/${entrySlug}/${id}`}
          >
            <TiUserOutline className="bg-primary-300 text-content-primary row-span-2 h-12 w-12 rounded-lg" />

            <span>{name}</span>
            <small>{email}</small>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Entries() {
  return (
    <Suspense fallback={<p>No Data</p>}>
      <EntriesList />
    </Suspense>
  );
}
