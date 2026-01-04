/**
 * Badminton Footwork Trainer V0
 * Mode: Singles, Right-handed, 3x3 landing grid
 * Output: timeline segments for visualization/animation
 */

export const V0 = (() => {
  // ---------------------------
  // Foundation A: Court & Grid
  // ---------------------------
  const CourtSpec = {
    unit: "normalized", // x,y in [0,1]
    boundaries: {
      singles: { left: 0.12, right: 0.88, top: 0.08, bottom: 0.92 },
      doubles: { left: 0.06, right: 0.94, top: 0.08, bottom: 0.92 },
    },
    netY: 0.50,
    lines: {
      shortServiceY: 0.42,
      longServiceYDoubles: 0.90,
    },
  };

  const LandingGrid = {
    mode: "3x3",
    cells: [
      { id: "F_L", label: "前左",  center: { x: 0.25, y: 0.30 }, zone: "front", side: "L" },
      { id: "F_C", label: "前中",  center: { x: 0.50, y: 0.30 }, zone: "front", side: "C" },
      { id: "F_R", label: "前右",  center: { x: 0.75, y: 0.30 }, zone: "front", side: "R" },

      { id: "M_L", label: "中左",  center: { x: 0.25, y: 0.50 }, zone: "mid",   side: "L" },
      { id: "M_C", label: "中中",  center: { x: 0.50, y: 0.50 }, zone: "mid",   side: "C" },
      { id: "M_R", label: "中右",  center: { x: 0.75, y: 0.50 }, zone: "mid",   side: "R" },

      { id: "R_L", label: "后左",  center: { x: 0.25, y: 0.75 }, zone: "rear",  side: "L" },
      { id: "R_C", label: "后中",  center: { x: 0.50, y: 0.75 }, zone: "rear",  side: "C" },
      { id: "R_R", label: "后右",  center: { x: 0.75, y: 0.75 }, zone: "rear",  side: "R" },
    ],
    getCell(id) {
      return this.cells.find(c => c.id === id) || null;
    }
  };

  // Singles neutral base (slightly behind geometric center)
  const BaseSpec = {
    singles: {
      neutral: { id: "BASE_S_NEUTRAL", x: 0.50, y: 0.58 }
    }
  };

  // ---------------------------
  // Foundation B: Criteria schema
  // ---------------------------
  // Each move/sequence should support:
  // - intent: start/travel/contact/recover
  // - criteria: coach-verifiable cues (v0 as text checklist)
  // - durationMs: baseline tempo
  // - relPath: relative polyline (dx,dy) starting at (0,0)
  // - contactPose: optional (lunge/scissor/none)

  // ---------------------------
  // Part 1: Primitive Library
  // ---------------------------
  const Primitives = {
    SPLIT: {
      id: "SPLIT",
      name: "Split Step",
      intent: "start",
      durationMs: 220,
      relPath: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }],
      contactPose: "none",
      criteria: [
        "对方击球瞬间双脚同时落地",
        "落地即启动，无停顿",
        "重心下沉，脚尖略外开"
      ],
      tags: ["universal"]
    },

    // Front court (right-handed)
    LUNGE_FH: {
      id: "LUNGE_FH",
      name: "Forehand Front Lunge",
      intent: "contact",
      durationMs: 420,
      // v0: move forward slightly (center/right front)
      relPath: [{ dx: 0.00, dy: 0.00 }, { dx: 0.02, dy: -0.22 }],
      contactPose: "lunge",
      criteria: [
        "最后一步刹车稳定（不滑过去）",
        "上身稳定不过度前扑",
        "触球后可回弹启动回位"
      ],
      tags: ["front", "forehand"]
    },

    LUNGE_BH: {
      id: "LUNGE_BH",
      name: "Backhand Front Lunge",
      intent: "contact",
      durationMs: 440,
      // v0: forward-left
      relPath: [{ dx: 0.00, dy: 0.00 }, { dx: -0.10, dy: -0.20 }],
      contactPose: "lunge",
      criteria: [
        "左脚前跨形成稳定支点",
        "身体略侧向，为反手触球留空间",
        "触球后立即回推回位"
      ],
      tags: ["front", "backhand"]
    },

    CHASSE: {
      id: "CHASSE",
      name: "Side Step / Chassé",
      intent: "travel",
      durationMs: 360,
      relPath: [{ dx: 0.00, dy: 0.00 }, { dx: 0.16, dy: 0.00 }],
      contactPose: "none",
      criteria: [
        "步幅短、频率快",
        "身体保持可随时转髋",
        "用于中场横向过渡"
      ],
      tags: ["mid", "travel"]
    },

    CROSS_TO_REAR: {
      id: "CROSS_TO_REAR",
      name: "Cross-over to Rear Court",
      intent: "travel",
      durationMs: 520,
      relPath: [
        { dx: 0.00, dy: 0.00 },
        { dx: 0.10, dy: 0.14 },
        { dx: 0.18, dy: 0.28 }
      ],
      contactPose: "none",
      criteria: [
        "先转髋再迈步（不是硬后退）",
        "交叉步带动身体旋转",
        "为剪刀步触球做准备"
      ],
      tags: ["rear", "travel"]
    },

    SCISSOR: {
      id: "SCISSOR",
      name: "Scissor Kick",
      intent: "contact",
      durationMs: 460,
      relPath: [{ dx: 0.00, dy: 0.00 }, { dx: 0.06, dy: 0.02 }],
      contactPose: "scissor",
      criteria: [
        "击球瞬间完成空中交换/剪刀动作",
        "落地后身体朝向回中方向",
        "落地即回位（不定格）"
      ],
      tags: ["rear", "forehand"]
    },

    RECOVER: {
      id: "RECOVER",
      name: "Recover to Base",
      intent: "recover",
      durationMs: 520,
      // placeholder: planner will override to actual vector
      relPath: [{ dx: 0.00, dy: 0.00 }, { dx: 0.00, dy: 0.00 }],
      contactPose: "none",
      criteria: [
        "第一回位步方向正确",
        "回到可接下一拍的位置（不必精确回原点）"
      ],
      tags: ["recover"]
    }
  };

  // ---------------------------
  // Part 2: Sequence Templates
  // ---------------------------
  const Sequences = {
    SEQ_FRONT_FH: {
      id: "SEQ_FRONT_FH",
      name: "前场正手接球",
      pattern: ["SPLIT", "LUNGE_FH", "RECOVER"],
      constraints: { zones: ["front"], hand: ["right"] }
    },
    SEQ_FRONT_BH: {
      id: "SEQ_FRONT_BH",
      name: "前场反手接球",
      pattern: ["SPLIT", "LUNGE_BH", "RECOVER"],
      constraints: { zones: ["front"], hand: ["right"] }
    },
    SEQ_REAR_FH: {
      id: "SEQ_REAR_FH",
      name: "后场正手角（交叉+剪刀）",
      pattern: ["SPLIT", "CROSS_TO_REAR", "SCISSOR", "RECOVER"],
      constraints: { zones: ["rear"], hand: ["right"] }
    }
  };

  // ---------------------------
  // Part 3: Landing -> Sequence Mapping (Singles, Right-handed)
  // v0 intentionally leaves some cells mapped to nearest workable sequence
  // ---------------------------
  const LandingToSequenceMap = {
    mode: "singles",
    hand: "right",
    map: {
      F_L: "SEQ_FRONT_BH",
      F_C: "SEQ_FRONT_FH",
      F_R: "SEQ_FRONT_FH",

      // v0: mid-court uses front logic as placeholder (v1 will add mid sequences)
      M_L: "SEQ_FRONT_BH",
      M_C: "SEQ_FRONT_FH",
      M_R: "SEQ_FRONT_FH",

      // rear left backhand corner is complex; v0 maps to rear FH as placeholder
      R_L: "SEQ_REAR_FH",
      R_C: "SEQ_REAR_FH",
      R_R: "SEQ_REAR_FH"
    }
  };

  // ---------------------------
  // RuleSet (v0 minimal validators)
  // ---------------------------
  const RuleSet = {
    allowedFlow: ["start", "travel", "contact", "recover"],
    validateSequence(seqPattern) {
      // must start with SPLIT
      if (!seqPattern.length || seqPattern[0] !== "SPLIT") {
        return { ok: false, msg: "序列必须以 SPLIT 开始" };
      }
      // must include at least one contact move
      const hasContact = seqPattern.some(mid => Primitives[mid]?.intent === "contact");
      if (!hasContact) {
        return { ok: false, msg: "序列必须包含 contact 动作" };
      }
      // must end with RECOVER
      if (seqPattern[seqPattern.length - 1] !== "RECOVER") {
        return { ok: false, msg: "序列必须以 RECOVER 结束" };
      }
      return { ok: true };
    }
  };

  // ---------------------------
  // Planner: landing cell -> timeline segments
  // Output segments are absolute positions (x,y), duration, intent, tags
  // Supports tempo controls: reactionMs, speed multiplier
  // ---------------------------
  function plan({
    landingId,
    baseId = "neutral",
    mode = "singles",
    hand = "right",
    tempo = { reactionMs: 180, speed: 1.0 }
  }) {
    const base =
      mode === "singles"
        ? BaseSpec.singles[baseId] || BaseSpec.singles.neutral
        : BaseSpec.singles.neutral;

    const cell = LandingGrid.getCell(landingId);
    if (!cell) throw new Error(`Unknown landingId: ${landingId}`);

    const seqId = LandingToSequenceMap.map[landingId];
    const seq = Sequences[seqId];
    if (!seq) throw new Error(`No sequence mapped for landingId: ${landingId}`);

    const validation = RuleSet.validateSequence(seq.pattern);
    if (!validation.ok) throw new Error(`Invalid sequence: ${validation.msg}`);

    // Build timeline
    const speed = Math.max(0.25, Math.min(3.0, tempo.speed ?? 1.0));
    const reactionMs = Math.max(0, tempo.reactionMs ?? 0);

    const segments = [];
    let cur = { x: base.x, y: base.y };

    // Helper: convert primitive relPath to absolute end-point
    const applyRel = (relEnd, from) => ({
      x: clamp01(from.x + relEnd.dx),
      y: clamp01(from.y + relEnd.dy),
    });

    // For v0: we slightly bias the end position of contact moves toward target cell center
    // to ensure the visualization "lands" near the chosen cell.
    const target = cell.center;

    for (let i = 0; i < seq.pattern.length; i++) {
      const moveId = seq.pattern[i];
      const m = Primitives[moveId];
      const dur = Math.round(m.durationMs / speed);

      if (moveId === "RECOVER") {
        // dynamic recover vector: current -> base
        const seg = {
          moveId,
          name: m.name,
          intent: m.intent,
          from: { ...cur },
          to: { x: base.x, y: base.y },
          durationMs: dur,
          contactPose: m.contactPose,
          criteria: m.criteria,
          tags: m.tags
        };
        segments.push(seg);
        cur = { ...seg.to };
        continue;
      }

      // normal primitive end point
      const relEnd = m.relPath[m.relPath.length - 1];
      let to = applyRel(relEnd, cur);

      // If this is a contact move, snap partially toward the target cell center (v0)
      if (m.intent === "contact") {
        to = {
          x: lerp(to.x, target.x, 0.75),
          y: lerp(to.y, target.y, 0.75),
        };
      }

      segments.push({
        moveId,
        name: m.name,
        intent: m.intent,
        from: { ...cur },
        to,
        durationMs: dur,
        contactPose: m.contactPose,
        criteria: m.criteria,
        tags: m.tags,
        reactionMs: i === 0 ? reactionMs : 0 // only on first segment (split) for now
      });
      cur = { ...to };
    }

    return {
      meta: { mode, hand, base: base.id, landingId, sequenceId: seqId },
      segments
    };
  }

  // utils
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  return {
    CourtSpec,
    LandingGrid,
    BaseSpec,
    Primitives,
    Sequences,
    LandingToSequenceMap,
    RuleSet,
    plan
  };
})();
