---
title: "My Open Source Projects"
author: "Varun Vaidhiya"
pubDatetime: 2026-02-10T12:00:00Z
modDatetime: 2026-10-07T10:00:00Z
slug: "my-projects"
featured: true
draft: false
tags:
  - projects
  - open-source
  - ai
  - robotics
description: "A round-up of my open source work spanning AI inference, robotics, performance analysis, and more."
---

# My Open Source Projects

Here's a collection of projects I've been building. All code is open source on [GitHub](https://github.com/varunvaidhiya).

---

## OmniBot

**Open-source mecanum mobile manipulator**

Open-source mecanum mobile manipulator (Yahboom base, SO-101 arm, Raspberry Pi 5, Meta Quest 3 teleop). Built on OhhO OS (Apache-2.0) — the package is `ohho-os` on PyPI (1.1.2, source: `ohho-sdk`).

**What works today:** The engine can talk to that base, run a simulator with no hardware attached, and record arm and base motion for later training. Supported today, with public code: ROS 2 topics, ROSBridge, and Web Serial. Built with ROS 2 Jazzy, Nav2, Gazebo, LeRobot, PyTorch, FastAPI, Unity / OpenXR, and Next.js.

**Roadmap:** One robot, one engine — the rest is roadmap. The website consoles are interactive demos with simulated data (prototype consoles: Build, Frame, Connect, Serve, View, Data, Train, Autonomy, Mind, Pilot). Fleet, twin, compliance and security consoles are roadmap (Bench, Bridge, Market, Fleet, Twin, Care, Comply, Shield, Proof). OhhO Comply is a roadmap checklist, not a certification tool (simulated checklist only; OhhO does not generate a technical file or a conformity certificate, and it does not claim ISO, CE, UL, or SOC 2). Certified fleets, one bill and a cheapest-price claim are roadmap, not what ships today.

[View on GitHub →](https://github.com/ohho-robotics/OmniBot)

---

## Mecanum-Wheel-Robot

**ROS-based mecanum wheel robot**

A robotics project using ROS (Robot Operating System) to control a mecanum wheel robot. Covers locomotion, motion planning, and sensor integration.

[View on GitHub →](https://github.com/ohho-robotics/OmniBot)

---

## SAM2forAV

**SAM2 model applied to autonomous vehicles**

Applying Meta's Segment Anything Model 2 (SAM2) to autonomous vehicle perception tasks. Explores zero-shot segmentation for AV sensor data.

[View on GitHub →](https://github.com/varunvaidhiya/SAM2forAV)

---

## AEB-Model-Based-Design

**Automatic Emergency Braking — Model-Based Design**

A model-based design implementation of an Automatic Emergency Braking (AEB) system, a safety-critical feature in modern vehicles.

[View on GitHub →](https://github.com/varunvaidhiya/AEB-Model-Based-Design)

---

## perfetto_analysis_repo

**Performance analysis with Perfetto**

Python scripts for capturing and analysing system traces using Google's Perfetto tracing tool. Useful for deep-diving into CPU scheduling, memory, and I/O behaviour.

[View on GitHub →](https://github.com/varunvaidhiya/perfetto_analysis_repo)

---

## libfreenect2

**Open-source drivers for Kinect for Windows v2**

Fork with Raspberry Pi / ARM NEON and USB transfer fixes.

[View on GitHub →](https://github.com/varunvaidhiya/libfreenect2)

---

## decentralized-voting-using-blockchain

**Decentralised voting with fingerprint authentication**

A blockchain-based voting system that uses MFS100 fingerprint scanner authentication to ensure secure, verifiable, and tamper-proof elections.

[View on GitHub →](https://github.com/varunvaidhiya/decentralized-voting-using-blockchain)

---

More coming soon. Follow me on [GitHub](https://github.com/varunvaidhiya) to stay updated, and check out my [YouTube channel](https://www.youtube.com/@varun.vaidhiya) for videos on AI, robotics, and performance engineering.
