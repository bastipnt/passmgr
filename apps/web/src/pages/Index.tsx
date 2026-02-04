import Entries from "../data-components/Entries";
import styles from "./Index.module.css";

export default function Index() {
  return (
    <section className={styles.section}>
      <Entries />
    </section>
  );
}
