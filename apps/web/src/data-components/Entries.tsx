import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense, useContext } from "react";
import { SelectedElementContext } from "../providers/SelectedElementProvider";

function EntriesList() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.all.queryOptions());
  const { setEntryId } = useContext(SelectedElementContext);

  return (
    <ul className="space-y-8">
      {data.entries.map(({ name, id, email }) => (
        <li key={id}>
          <button
            className="grid cursor-pointer grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-3 text-left"
            onClick={() => setEntryId(id)}
          >
            <span className="row-span-2 h-12 w-12 rounded-lg bg-gray-400 p-2">
              <img src="/user-icon.svg" alt="" />
            </span>
            <span>
              <strong>{name}</strong>
            </span>
            <span>{email}</span>
          </button>
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
