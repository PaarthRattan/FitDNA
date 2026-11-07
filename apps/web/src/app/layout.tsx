import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FitDNA — Know your fit. Before you buy.",
    template: "%s · FitDNA",
  },
  description:
    "FitDNA builds a Fit Passport from a guided body scan and your reference garments, then predicts how tops and jackets across every marketplace will fit you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      {/* The literal black page frame: 8px on desktop, 4px on small screens. */}
      <body className="min-h-full bg-ink p-1 sm:p-2">
        <div className="bg-canvas mx-auto max-w-[1080px] min-h-[calc(100vh-16px)] flex flex-col">{children}</div>
      </body>
    </html>
  );
}
