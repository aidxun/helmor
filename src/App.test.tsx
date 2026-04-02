import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import App from "./App";

vi.mock("./App.css", () => ({}));

describe("App", () => {
  it("renders an empty application window", () => {
    render(<App />);

    const shell = screen.getByRole("main", { name: "Empty application window" });

    expect(shell).toBeEmptyDOMElement();
    expect(shell).toHaveClass("min-h-screen");
    expect(shell).toHaveClass("bg-black");
  });
});
