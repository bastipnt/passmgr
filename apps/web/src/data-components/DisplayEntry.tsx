import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense, useContext } from "react";
import { SelectedElementContext } from "../providers/SelectedElementProvider";

function DisplayEntryList() {
  const trpc = useTRPC();
  const { entryId } = useContext(SelectedElementContext);

  const { data } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));

  return (
    <ul>
      <li>{data.id}</li>
      <li>{data.name}</li>
      <li>{data.email}</li>
      <li>{data.password}</li>
    </ul>
  );
}

export default function DisplayEntry() {
  return (
    <section>
      <Suspense fallback={<p>No Data</p>}>
        <DisplayEntryList />
      </Suspense>
    </section>
  );
}
