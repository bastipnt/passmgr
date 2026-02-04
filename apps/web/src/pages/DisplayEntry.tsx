import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense, useState } from "react";
import { Toast } from "../components/Toast";
import { TiPencil, TiUserAddOutline } from "react-icons/ti";
import { Button } from "../components/Button";
import EntryList from "../components/EntryList";
import { useParams } from "wouter";
import ButtonLink from "../components/ButtonLink";
import { editSlug } from "../data/routes";

function Fallback() {
  return (
    <div className="space-y-4 p-2">
      <h1>Loading...</h1>
      <EntryList>
        <EntryList.Item name="Loading..." value="••••••••••••" setToastMessage={() => {}} />
      </EntryList>
    </div>
  );
}

type DisplayEntryListProps = {
  entryId: string;
};

function DisplayEntryList({ entryId }: DisplayEntryListProps) {
  const trpc = useTRPC();

  const { data } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));
  const [toastMessage, setToastMessage] = useState("");

  return (
    <>
      <div className="space-y-8 p-4">
        <div className="grid grid-cols-[1fr_auto] items-center">
          <h1>{data.title}</h1>
          <div className="flex flex-row gap-2">
            <ButtonLink href={`/${editSlug}/${entryId}`}>
              <TiPencil className="text-lg" />
              Edit
            </ButtonLink>
            <Button variant="secondary">
              <TiUserAddOutline />
              Share
            </Button>
          </div>
        </div>

        <EntryList>
          <EntryList.Item name="username" value={data.username} setToastMessage={setToastMessage} />

          <EntryList.Item
            name="password"
            value={data.password}
            setToastMessage={setToastMessage}
            valueHidden
          />
        </EntryList>
      </div>
      <Toast message={toastMessage} isOpen={!!toastMessage} onClose={() => setToastMessage("")} />
    </>
  );
}

export default function DisplayEntry() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return (
    <Suspense fallback={<Fallback />}>
      <DisplayEntryList entryId={entryId} />
    </Suspense>
  );
}
