export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black print:bg-white">{children}</div>;
}