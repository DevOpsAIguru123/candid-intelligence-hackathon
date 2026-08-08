import Link from "next/link";

const navigation = [
  { label: "Overview", href: "/", marker: "01" },
  { label: "Conferences", href: "/conferences", marker: "02" },
  { label: "Speakers", href: "/speakers", marker: "03" },
  { label: "Sequences", href: "/sequences", marker: "04" },
  { label: "Funnel", href: "/funnel", marker: "05" },
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
          <small>ORIGINATION INTELLIGENCE</small>
        </span>
      </Link>

      <nav aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link href={item.href} key={item.label}>
            <span aria-hidden="true">{item.marker}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="live-dot" aria-hidden="true" />
        <span>
          <strong>Signal engine online</strong>
          <small>Public sources only</small>
        </span>
      </div>
    </aside>
  );
}
