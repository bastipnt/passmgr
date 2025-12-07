import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import Entries from "../data-components/Entries";
import DisplayEntry from "../data-components/DisplayEntry";
import { useState } from "react";
import EditEntry from "../data-components/EditEntry";

export default function Index() {
  const trpc = useTRPC();
  const usersQuery = useQuery(trpc.user.getAllUsers.queryOptions());
  const [edit, setEdit] = useState(false);

  return (
    <div className="grid min-h-screen grid-flow-col grid-rows-[auto_1fr_auto] gap-y-4">
      <header className="bg-amber-50 p-4">header</header>
      <main className="grid grid-cols-2 grid-rows-[auto_1fr] gap-y-4">
        <section className="col-span-2">
          <h1>Hello there lol</h1>
          <p>{String(usersQuery.data?.message)}</p>
        </section>
        <section>
          <Entries />
        </section>
        <section>
          <>
            <button onClick={() => setEdit(!edit)}>Toggle edit</button>
            {edit ? <EditEntry /> : <DisplayEntry />}
          </>
        </section>
      </main>
      <footer className="bg-amber-50 p-4"> Footer</footer>
    </div>
  );
}
