import { z } from "zod";
import { assertTimeline } from "../lib/timeline";

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const spotlightRectSchema = rectSchema.extend({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const timelineEventSchema = z.discriminatedUnion("kind", [
  z.object({ t: z.number(), kind: z.literal("role"), label: z.string() }),
  z.object({
    t: z.number(),
    kind: z.literal("window"),
    image: z.string().min(1),
    imageWidth: z.number().positive(),
    imageHeight: z.number().positive(),
    title: z.string().optional(),
    holdMs: z.number().nonnegative(),
    enterMs: z.number().nonnegative(),
    exitMs: z.number().nonnegative(),
    highlight: spotlightRectSchema.optional(),
    click: z.boolean().optional(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("transition"),
    label: z.string(),
    role: z.string().optional(),
    outMs: z.number().nonnegative(),
    cardMs: z.number().nonnegative(),
    inMs: z.number().nonnegative(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("cursor"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("click"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("caption"),
    text: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("zoom"),
    rect: rectSchema.nullable(),
    durationMs: z.number().optional(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("spotlight"),
    rect: spotlightRectSchema,
    durationMs: z.number().nonnegative(),
    holdMs: z.number().nonnegative(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal("outro"),
    title: z.string(),
    durationMs: z.number().nonnegative(),
  }),
]);

const timelineSchema = z
  .object({
    version: z.literal(1),
    name: z.string(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
      deviceScaleFactor: z.number(),
    }),
    capture: z.object({
      fps: z.number(),
      syncFlashAt: z.number(),
    }),
    durationMs: z.number(),
    events: z.array(timelineEventSchema),
  })
  .superRefine((timeline, context) => {
    try {
      assertTimeline(timeline);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid demo timeline",
      });
    }
  });

export const demoVideoSchema = z.object({
  timeline: timelineSchema,
  videoSrc: z.string(),
  windowChrome: z.enum(["none", "macos", "browser"]),
});
