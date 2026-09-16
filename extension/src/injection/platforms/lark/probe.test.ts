// @vitest-environment jsdom

import { expect, it, describe } from "vitest";
import { probeLarkContext, probeLarkDetail } from "./probe";

describe("probeLarkDetail", () => {
  it("extracts a title and field values from detail rows with controls", () => {
    document.body.innerHTML = `
      <aside class="record-detail-panel">
        <div class="detail-header"><h2>Burger 出库对接2</h2></div>
        <section class="field-list">
          <div class="field-row">
            <label>Status</label>
            <input value="Testing" />
          </div>
          <div class="field-item">
            <span class="field-label">Priority</span>
            <textarea></textarea>
          </div>
        </section>
      </aside>
    `;

    expect(probeLarkDetail()).toMatchObject({
      isOpen: true,
    });
    expect(probeLarkContext(document.querySelector("aside")!)).toEqual({
      title: "Burger 出库对接2",
      fields: [
        { label: "Status", value: "Testing" },
        { label: "Priority", value: "" },
      ],
    });
  });

  it("returns detail-loading when a detail shell is present but fields are not ready", () => {
    document.body.innerHTML = `
      <aside class="record-detail-panel">
        <div class="detail-header"><h2>Loading panel</h2></div>
      </aside>
    `;

    expect(probeLarkDetail()).toMatchObject({
      isOpen: true,
      reason: "loading",
    });
    expect(probeLarkContext(document.querySelector("aside")!)).toBeNull();
  });

  it("returns closed when the side panel does not look like a detail view", () => {
    document.body.innerHTML = `
      <aside class="record-summary-panel">
        <p>No fields are shown here</p>
      </aside>
    `;

    expect(probeLarkDetail()).toEqual({
      isOpen: false,
      detailRoot: null,
    });
    expect(probeLarkContext(document.querySelector("aside")!)).toBeNull();
  });
});
