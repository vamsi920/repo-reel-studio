import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoFileSelectedMessage } from "#/components/features/files-tab/no-file-selected-message";

// NoFileSelectedMessage had no test file of its own — only indirect coverage
// through the files-tab route test asserting the translated text appears.
// This locks in the component's own contract directly.
describe("NoFileSelectedMessage", () => {
  it("renders the no-file-selected copy", () => {
    render(<NoFileSelectedMessage />);

    expect(
      screen.getByText("FILES$NO_FILE_SELECTED"),
    ).toBeInTheDocument();
  });
});
