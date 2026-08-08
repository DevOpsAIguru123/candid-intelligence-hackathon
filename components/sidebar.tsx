import Link from "next/link";

/**
 * Both navigations kept: the planning views and the cross-conference lists.
 * Grouped so the sidebar still reads as two jobs rather than seven links.
 */
const navigation = [
  { label: "Overview", href: "/", marker: "01" },
  { label: "Calendar", href: "/calendar", marker: "02" },
  { label: "Conferences", href: "/conferences", marker: "03" },
  { label: "Speakers", href: "/speakers", marker: "04" },
  { label: "Sequences", href: "/sequences", marker: "05" },
  { label: "My plan", href: "/plan", marker: "06" },
  { label: "Progress", href: "/funnel", marker: "07" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Speaker Signal overview">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <span>
          <strong>SPEAKER SIGNAL</strong>
          <small>FIND THE RIGHT PEOPLE</small>
        </span>
      </Link>

      {/* Prefetch is off deliberately: these pages show data the user is
          actively changing, and a payload fetched on page load would show a
          stale plan or funnel right after a decision is saved. */}
      <nav aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link href={item.href} key={item.label} prefetch={false}>
            <span aria-hidden="true">{item.marker}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="live-dot" aria-hidden="true" />
        <span>
          <strong>Running</strong>
          <small>Public event websites only</small>
        </span>
      </div>
    </aside>
  );
}
