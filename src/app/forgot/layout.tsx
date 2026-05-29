import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Receive a password reset link by email.",
  alternates: { canonical: "/forgot" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
