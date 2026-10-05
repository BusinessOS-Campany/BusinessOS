"use client";

import Link from "next/link";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label, printHref }: { label: string; printHref?: string }) {
  if (printHref) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={printHref} target="_blank" rel="noopener noreferrer">
          <Printer className="size-4" />
          {label}
        </Link>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" />
      {label}
    </Button>
  );
}

export function PdfButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <FileDown className="size-4" />
      {label}
    </Button>
  );
}
