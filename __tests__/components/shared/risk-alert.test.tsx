import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskAlert } from "#/components/shared/risk-alert";

describe("RiskAlert", () => {
  it("announces a high-severity alert to assistive tech and renders its content", () => {
    render(
      <RiskAlert
        severity="high"
        title="High Risk"
        content="This command may be destructive."
        icon={<span data-testid="risk-icon" />}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("High Risk");
    expect(alert).toHaveTextContent("This command may be destructive.");
    expect(screen.getByTestId("risk-icon")).toBeInTheDocument();
  });

  it("applies the passed className to the alert container", () => {
    render(
      <RiskAlert
        severity="high"
        title="High Risk"
        content="Content"
        className="custom-class"
      />,
    );

    expect(screen.getByRole("alert")).toHaveClass("custom-class");
  });

  it("renders nothing for medium severity, since only high is currently supported", () => {
    const { container } = render(
      <RiskAlert severity="medium" title="Medium Risk" content="Content" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing for low severity, since only high is currently supported", () => {
    const { container } = render(
      <RiskAlert severity="low" title="Low Risk" content="Content" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
