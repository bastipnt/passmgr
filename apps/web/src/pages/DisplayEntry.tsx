import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { TiPencil, TiUserAddOutline } from "react-icons/ti";
import { Button } from "@repo/ui/components/Button";
import EntryList from "@repo/ui/complex-components/EntryList";
import { useParams } from "wouter";
import ButtonLink from "@repo/ui/components/ButtonLink";
import { editSlug } from "../data/routes";
import styles from "./DisplayEntry.module.css";
import { useTRPC } from "@repo/client";
import { toast } from "@repo/ui";

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
          <EntryList.Item name="username" value={data.username} setToastMessage={toast} />

          <EntryList.Item
            name="password"
            value={data.password}
            setToastMessage={toast}
            valueHidden
          />
        </EntryList>
      </div>
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
