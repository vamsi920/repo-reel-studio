import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectorFieldInput } from "#/components/features/environment/connections/connector-field-input";
import type { ConnectorField } from "#/lib/environment/types/capability";

function conditionalField(): ConnectorField {
  return {
    name: "token",
    kind: "text",
    secret: true,
    required: { whenFieldEquals: ["authMethod", "token"] },
    labelKey: "CONNECTOR$FIELD_API_KEY",
  };
}

describe("ConnectorFieldInput", () => {
  it("shows the required tag when the whenFieldEquals condition is met", () => {
    render(
      <ConnectorFieldInput
        field={conditionalField()}
        value=""
        formValues={{ authMethod: "token" }}
        onChange={vi.fn()}
      />,
    );

    const field = screen.getByTestId("connector-field-token").closest("label");
    expect(field).toHaveTextContent("*");
    expect(field).not.toHaveTextContent("COMMON$OPTIONAL");
  });

  it("shows the optional tag when the whenFieldEquals condition is not met", () => {
    render(
      <ConnectorFieldInput
        field={conditionalField()}
        value=""
        formValues={{ authMethod: "oauth" }}
        onChange={vi.fn()}
      />,
    );

    const field = screen.getByTestId("connector-field-token").closest("label");
    expect(field).toHaveTextContent("COMMON$OPTIONAL");
  });
});
