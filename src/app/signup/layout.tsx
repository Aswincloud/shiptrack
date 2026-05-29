import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your free account",
  description:
    "Sign up for free to track Blue Dart shipments and get instant email alerts on status changes.",
  alternates: { canonical: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
