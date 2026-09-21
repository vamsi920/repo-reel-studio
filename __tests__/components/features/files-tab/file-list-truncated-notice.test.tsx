import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileListTruncatedNotice } from "#/components/features/files-tab/file-list-truncated-notice";

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string, options?: { shown?: string; total?: string }) =>
        options
          ? `${key}:${options.shown}/${options.total}`
          : key,
      i18n: { language: "en" },
    }),
  };
});

describe("FileListTruncatedNotice", () => {
  it("announces the cut as a status region, with both counts grouped for the locale", () => {
    render(<FileListTruncatedNotice shown={2000} total={5312} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("FILES$LIST_TRUNCATED:2,000/5,312");
  });

  it("renders small counts without thousands separators", () => {
    render(<FileListTruncatedNotice shown={3} total={7} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("FILES$LIST_TRUNCATED:3/7");
  });
});
