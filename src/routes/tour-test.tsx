import { createFileRoute } from "@tanstack/react-router";
import { OnboardingTour, REPLAY_TOUR_EVENT } from "@/components/shared/onboarding-tour";

export const Route = createFileRoute("/tour-test")({
  ssr: false,
  component: () => (
    <div style={{ padding: 40 }}>
      <button data-tour="/talent/vault" id="fake-target">Vault</button>
      <button
        id="replay"
        onClick={() => window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT))}
      >
        Replay
      </button>
      <OnboardingTour portal="talent" />
    </div>
  ),
});
