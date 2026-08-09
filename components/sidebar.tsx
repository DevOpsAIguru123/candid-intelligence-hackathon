import Link from "next/link";

/**
 * One entry per destination. Conferences is the events board; the calendar
 * view and a second conferences list showed the same table.
 */
const navigation = [
  { label: "Overview", href: "/", marker: "01" },
  { label: "Conferences", href: "/conferences", marker: "02" },
  { label: "Speakers", href: "/speakers", marker: "03" },
  { label: "My plan", href: "/plan", marker: "04" },
  { label: "Progress", href: "/funnel", marker: "05" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="GTM Intelligence Agent overview">
        <span className="brand-mark" aria-hidden="true">
          G
        </span>
        <span>
          <strong>GTM INTELLIGENCE</strong>
          <small>EVENT & LEAD AGENT</small>
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
