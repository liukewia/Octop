import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMessageNotice, showMessageNotice, type NoticeHandle, type NoticeSink } from "./message-notice";

const PATH = "/chat/01AGENT/01THREAD";

test("accepts a chat path and trims the copy", () => {
  assert.deepEqual(parseMessageNotice({ title: "  助手  ", body: "记得喝水", path: PATH }), {
    title: "助手",
    body: "记得喝水",
    path: PATH,
  });
  assert.deepEqual(
    parseMessageNotice({
      title: "远程助手",
      body: "需要确认",
      path: "/chat/bridge%3Aconn1%3Aagent2/room~member",
      tag: "hitl:p1",
    }),
    {
      title: "远程助手",
      body: "需要确认",
      path: "/chat/bridge%3Aconn1%3Aagent2/room~member",
      tag: "hitl:p1",
    },
  );
  assert.deepEqual(parseMessageNotice({ title: "定时任务", body: "执行失败", path: "/chat/01AGENT" }), {
    title: "定时任务",
    body: "执行失败",
    path: "/chat/01AGENT",
  });
});

test("rejects anything that is not one in-app chat", () => {
  assert.equal(parseMessageNotice(null), null);
  assert.equal(parseMessageNotice({ title: "助手", body: "hi", path: "/settings" }), null);
  assert.equal(parseMessageNotice({ title: "助手", body: "hi", path: "/chat/a/b/c" }), null);
  assert.equal(parseMessageNotice({ title: "助手", body: "hi", path: "/chat/a/../b" }), null);
  assert.equal(parseMessageNotice({ title: "助手", body: "hi", path: "https://evil.example/chat/a/b" }), null);
  assert.equal(parseMessageNotice({ title: "  ", body: "hi", path: PATH }), null);
  assert.equal(parseMessageNotice({ title: "助手", body: "", path: PATH }), null);
});

test("caps a long body", () => {
  const body = "字".repeat(300);
  const notice = parseMessageNotice({ title: "助手", body, path: PATH });
  assert.ok(notice);
  assert.equal(notice.body.length, 240);
  assert.equal(notice.body.endsWith("…"), true);
});

test("shows a popup and replaces the previous one for that chat", () => {
  const made: FakeNotice[] = [];
  const sink = fakeSink(made);
  let clicks = 0;
  assert.equal(showMessageNotice({ title: "助手", body: "第一条", path: PATH }, sink, () => clicks++), true);
  assert.equal(showMessageNotice({ title: "助手", body: "第二条", path: PATH }, sink, () => clicks++), true);
  assert.equal(made[0]?.closed, true);
  assert.equal(made[1]?.shown, true);
  made[1]?.click();
  assert.equal(clicks, 1);
});

test("does nothing when the OS cannot show a popup", () => {
  const sink: NoticeSink = {
    isSupported: () => false,
    create: () => {
      throw new Error("should not create");
    },
  };
  assert.equal(showMessageNotice({ title: "助手", body: "hi", path: PATH }, sink, () => {}), false);
});

class FakeNotice implements NoticeHandle {
  shown = false;
  closed = false;
  private listener: (() => void) | null = null;

  show(): void {
    this.shown = true;
  }

  close(): void {
    this.closed = true;
  }

  on(_event: "click", listener: () => void): void {
    this.listener = listener;
  }

  click(): void {
    this.listener?.();
  }
}

function fakeSink(made: FakeNotice[]): NoticeSink {
  return {
    isSupported: () => true,
    create: () => {
      const notice = new FakeNotice();
      made.push(notice);
      return notice;
    },
  };
}
