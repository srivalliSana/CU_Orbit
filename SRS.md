# Software Requirements Specification (SRS) - CU Orbit

## 1. Introduction
CU Orbit is a professional university communication platform designed to streamline collaboration among students, faculty, and staff. It combines real-time messaging, media sharing, and social updates into a single "Super App" ecosystem.

## 2. Overall Description
### 2.1 Product Perspective
CU Orbit is an Android-based application supported by a Node.js/MySQL backend. It is designed to replace fragmented communication tools with a unified workspace.

### 2.2 Product Functions
- **Real-time Messaging**: Instant text messaging in channels and Direct Messages.
- **Direct Login**: Password-less entry via phone number bypass for rapid testing.
- **Media Sharing**: Support for uploading and viewing images, files, and voice notes.
- **Status Updates (Stories)**: WhatsApp-style updates that expire after 24 hours.
- **Call Tracking**: Logging of voice and video call activity.
- **Contact Integration**: Discovering teammates and inviting peers via SMS.
- **Read Receipts**: Visual confirmation of message delivery and read status.

### 2.3 User Classes and Characteristics
- **Students**: Primary users for collaborative learning and social interaction.
- **Admin/Faculty**: Managed communication via public announcement channels.

## 3. System Features
- **User Authentication**: Simple bypass-enabled phone number registration.
- **Channel Management**: Public and private workspaces for different departments/teams.
- **Story Viewer**: Full-screen immersive media viewer with timer progression.
- **Local/Production Modes**: Easy switching between localhost and production domains.

## 4. External Interface Requirements
- **User Interface**: Material 3 Design, Slack-inspired layout with WhatsApp-style messaging.
- **Hardware Interfaces**: Camera, Microphone, and Internal Storage access.
- **Software Interfaces**: Retrofit for API communication, Coil for image loading.

## 5. Nonfunctional Requirements
- **Reliability**: Self-healing server logic to handle database glitches gracefully.
- **Scalability**: Designed with a shared DM architecture to handle high volume.
- **Usability**: Intuitive bottom navigation for core feature access.
