import { redirect } from "next/navigation";

// Root route — redirect to the tutor page
export default function Home() {
  redirect("/tutor");
}
