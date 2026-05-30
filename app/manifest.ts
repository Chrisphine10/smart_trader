import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hydra Trade AI",
    short_name: "Hydra AI",
    start_url: "/trade",
    display: "standalone",
    background_color: "#13161e",
    theme_color: "#FACC15",
    icons: [{ src: "/brand/hydra-logo.png", sizes: "1024x1024", type: "image/png" }],
  };
}
