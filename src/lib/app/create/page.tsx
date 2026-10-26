import type { Metadata } from "next";
import { Studio } from "@/components/studio/studio";

export const metadata: Metadata = {
  title: "Create a Character — LoreForge AI",
};

export default function CreatePage() {
  return <Studio />;
}
