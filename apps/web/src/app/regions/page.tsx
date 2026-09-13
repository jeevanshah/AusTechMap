import { permanentRedirect } from "next/navigation";

export default function RegionsIndexPage() {
  permanentRedirect("/?tab=regions#directory-content");
}
