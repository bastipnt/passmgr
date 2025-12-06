import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";

export default function Index() {
  const trpc = useTRPC();

  const usersQuery = useQuery(trpc.user.getAllUsers.queryOptions());

  return (
    <>
      <h1>Hello there lol</h1>
      <p>{String(usersQuery.data?.message)}</p>
    </>
  );
}
