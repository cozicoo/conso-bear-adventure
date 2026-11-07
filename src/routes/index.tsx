import { createFileRoute } from "@tanstack/react-router";
import { ConsoGame } from "@/components/conso-game";

export const Route = createFileRoute("/")({ component: ConsoGame });
