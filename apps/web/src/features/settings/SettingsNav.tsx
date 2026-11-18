import { SidebarItem } from "@repo/ui/components/SidebarItem";
import { cn } from "@repo/ui/lib/utils";
import { useId } from "react";
import { useRoute, Link as WouterLink } from "wouter";
import { SessionActions } from "./SessionActions";
import { type SectionDetail, type SettingsSection, useSettingsGroups } from "./settings-sections";

function NavItem({ section, detail }: { section: SettingsSection; detail?: SectionDetail }) {
  const [active] = useRoute(`${section.path}/*?`);

  return (
    <SidebarItem
      icon={section.icon}
      label={section.label}
      count={detail?.count}
      active={active}
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-10 font-normal [&_svg]:text-muted-foreground",
        active &&
          "bg-muted font-medium text-primary-text hover:bg-muted dark:bg-muted [&_svg]:text-primary-text",
      )}
      trailing={
        detail?.synced && (
          <>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
            <span className="sr-only">Synced</span>
          </>
        )
      }
      render={<WouterLink href={section.path} />}
    />
  );
}

/** The overlay's section list, grouped, with Lock now / Sign out at its foot. */
export function SettingsNav({ details }: { details: Partial<Record<string, SectionDetail>> }) {
  const groupId = useId();
  const groups = useSettingsGroups({ phone: false });

  return (
    <nav
      aria-label="Settings sections"
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-border border-r bg-card px-4 pt-1 pb-4"
    >
      {groups.map((group, index) => (
        <div key={group.label}>
          <p
            id={`${groupId}-${index}`}
            className="px-3 pt-5 pb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]"
          >
            {group.label}
          </p>
          <ul aria-labelledby={`${groupId}-${index}`} className="flex flex-col gap-0.5">
            {group.sections.map((section) => (
              <li key={section.path}>
                <NavItem section={section} detail={details[section.path]} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <SessionActions className="mt-auto border-border border-t pt-4" />
    </nav>
  );
}
