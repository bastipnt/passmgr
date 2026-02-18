import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Toast } from "@repo/ui/toast";
import { TiPencil, TiUserAddOutline } from "react-icons/ti";
import { Button } from "@repo/ui/Button";
import EntryList from "@repo/ui/EntryList";
import { useParams } from "wouter";
import ButtonLink from "@repo/ui/ButtonLink";
import { editSlug } from "../data/routes";
import styles from "./DisplayEntry.module.css";
import { useTRPC } from "@repo/client";

function Fallback() {
  return (
    <div className={styles.fallback}>
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
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>{data.title}</h1>
          <div className={styles.actions}>
            <ButtonLink href={`/${editSlug}/${entryId}`}>
              <TiPencil />
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
