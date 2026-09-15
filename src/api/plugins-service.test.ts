import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileClient,
  PluginsClient,
} from "@openhands/typescript-client/clients";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "./backend-registry/active-store";
import PluginsService, {
  isPluginsEndpointUnsupported,
} from "./plugins-service";

vi.mock("@openhands/typescript-client/clients", () => ({
  PluginsClient: vi.fn(),
  FileClient: vi.fn(),
}));

const getPluginsMarketplace = vi.fn();
const getPlugins = vi.fn();
const downloadFile = vi.fn();
const close = vi.fn();

/** Mirrors the SDK `HttpError` shape: `name === "HttpError"` + numeric status. */
function sdkHttpError(status: number, body: unknown = { detail: "boom" }) {
  const error = new Error(
    `HTTP request failed (${status} ): ${JSON.stringify(body)}`,
  ) as Error & { status: number; response: unknown };
  error.name = "HttpError";
  error.status = status;
  error.response = body;
  return error;
}

function useBackend(kind: "local" | "cloud"): void {
  setRegisteredBackends([
    {
      id: kind,
      name: kind,
      host: "http://127.0.0.1:8001",
      apiKey: "session-key",
      kind,
    },
  ]);
  setActiveSelection({ backendId: kind, orgId: null });
}

describe("PluginsService.getPluginsMarketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PluginsClient).mockImplementation(function MockPluginsClient() {
      return { getPluginsMarketplace, close } as unknown as PluginsClient;
    } as unknown as typeof PluginsClient);
  });

  it("returns the catalog from the local agent-server", async () => {
    useBackend("local");
    const plugin = {
      name: "city-weather",
      description: "Weather plugin",
      source: "github:OpenHands/extensions",
      ref: null,
      repo_path: "plugins/city-weather",
      installed: false,
    };
    getPluginsMarketplace.mockResolvedValue({ plugins: [plugin] });

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([plugin]);
    expect(getPluginsMarketplace).toHaveBeenCalledTimes(1);
  });

  it("returns an empty catalog on a cloud backend without calling the client", async () => {
    useBackend("cloud");

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([]);
    expect(PluginsClient).not.toHaveBeenCalled();
  });

  it("returns an empty catalog when the agent-server has no plugins route (404)", async () => {
    useBackend("local");
    getPluginsMarketplace.mockRejectedValue(sdkHttpError(404));

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([]);
  });

  it("rethrows a 5xx so the page can show its error state and retry", async () => {
    useBackend("local");
    const error = sdkHttpError(500);
    getPluginsMarketplace.mockRejectedValue(error);

    await expect(PluginsService.getPluginsMarketplace()).rejects.toBe(error);
  });

  it("rethrows a transport failure instead of faking an empty catalog", async () => {
    useBackend("local");
    const error = new Error("Request failed: Failed to fetch");
    getPluginsMarketplace.mockRejectedValue(error);

    await expect(PluginsService.getPluginsMarketplace()).rejects.toBe(error);
  });
});

describe("isPluginsEndpointUnsupported", () => {
  it("is true only for a missing-route HTTP status from the SDK client", () => {
    expect(isPluginsEndpointUnsupported(sdkHttpError(404))).toBe(true);
    expect(isPluginsEndpointUnsupported(sdkHttpError(405))).toBe(true);
    expect(isPluginsEndpointUnsupported(sdkHttpError(500))).toBe(false);
    expect(isPluginsEndpointUnsupported(sdkHttpError(502))).toBe(false);
    expect(
      isPluginsEndpointUnsupported(
        new Error("Request failed: Failed to fetch"),
      ),
    ).toBe(false);
    expect(isPluginsEndpointUnsupported(undefined)).toBe(false);
  });
});

describe("PluginsService.getLocalPlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PluginsClient).mockImplementation(function MockPluginsClient() {
      return { getPlugins, close } as unknown as PluginsClient;
    } as unknown as typeof PluginsClient);
  });

  it("requests user-level local plugins from the local agent-server", async () => {
    useBackend("local");
    const plugin = {
      name: "hello-local",
      version: "1.0.0",
      description: "A local plugin",
    };
    getPlugins.mockResolvedValue({ plugins: [plugin] });

    const result = await PluginsService.getLocalPlugins();

    expect(result).toEqual([plugin]);
    expect(getPlugins).toHaveBeenCalledWith({
      load_user: true,
      load_project: false,
    });
  });

  it("returns an empty list on a cloud backend without calling the client", async () => {
    useBackend("cloud");

    const result = await PluginsService.getLocalPlugins();

    expect(result).toEqual([]);
    expect(PluginsClient).not.toHaveBeenCalled();
  });

  it("returns an empty list when the agent-server has no plugins route (404)", async () => {
    useBackend("local");
    getPlugins.mockRejectedValue(sdkHttpError(404));

    await expect(PluginsService.getLocalPlugins()).resolves.toEqual([]);
  });

  it("rethrows a 5xx", async () => {
    useBackend("local");
    const error = sdkHttpError(503);
    getPlugins.mockRejectedValue(error);

    await expect(PluginsService.getLocalPlugins()).rejects.toBe(error);
  });
});

describe("PluginsService.getPluginFileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(FileClient).mockImplementation(function MockFileClient() {
      return { downloadFile, close } as unknown as FileClient;
    } as unknown as typeof FileClient);
  });

  it("downloads the file under the plugin directory and decodes it as text", async () => {
    useBackend("local");
    downloadFile.mockResolvedValue(new TextEncoder().encode("# Hello").buffer);

    const result = await PluginsService.getPluginFileContent(
      "/plugins/demo",
      "docs/README.md",
    );

    expect(result).toEqual({ kind: "text", text: "# Hello" });
    expect(downloadFile).toHaveBeenCalledWith("/plugins/demo/docs/README.md");
  });

  it("flags content containing NUL bytes as binary", async () => {
    useBackend("local");
    downloadFile.mockResolvedValue(
      new Uint8Array([0x89, 0x50, 0x00, 0x47]).buffer,
    );

    const result = await PluginsService.getPluginFileContent(
      "/plugins/demo",
      "logo.png",
    );

    expect(result).toEqual({ kind: "binary", text: null });
  });

  it("rejects on a cloud backend without calling the client", async () => {
    useBackend("cloud");

    await expect(
      PluginsService.getPluginFileContent("/plugins/demo", "README.md"),
    ).rejects.toThrow();
    expect(FileClient).not.toHaveBeenCalled();
  });
});
