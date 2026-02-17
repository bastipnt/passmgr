import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Link, useRoute } from "wouter";
import { entrySlug } from "../data/routes";
import { TiUserOutline } from "react-icons/ti";
import { cn } from "@repo/util";
import styles from "./Entries.module.css";
import { useTRPC } from "@repo/client";

type EntriesListProps = {
  entryId?: string;
};

function EntriesList({ entryId }: EntriesListProps) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.all.queryOptions());

  return (
    <ul className={styles.entryList}>
      {data.entries.map(({ id, title, username }) => {
        const active = id === entryId;

        return (
          <li key={id} className={cn("gradientBorder", styles.entryItem)}>
            <Link
              className={cn(styles.entryLink, active && styles.entryLinkActive)}
              to={`../${entrySlug}/${id}`}
            >
              <TiUserOutline className={styles.avatar} />

              <span className={styles.title}>{title}</span>
              <small className={styles.username}>{username}</small>
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
