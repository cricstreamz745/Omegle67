import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// 👉 Change this to your backend URL
const socket = io("https://omegle-25ce.onrender.com");

function App() {
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerConnection = useRef(null);
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    let localStream;

    const start = async () => {
      try {
        // ✅ Get camera + mic
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.current.srcObject = localStream;
        console.log("[DEBUG] Local stream captured");

        socket.on("waiting", () => {
          setStatus("Waiting for a partner...");
          console.log("[DEBUG] Waiting for partner...");
        });

        socket.on("partner-found", async () => {
          setStatus("Connected!");
          console.log("[DEBUG] Partner found, creating RTCPeerConnection...");

          // ✅ Add STUN servers
          peerConnection.current = new RTCPeerConnection({
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ]
          });

          // ✅ Add local stream tracks
          localStream.getTracks().forEach(track => {
            peerConnection.current.addTrack(track, localStream);
            console.log("[DEBUG] Added local track:", track.kind);
          });

          // ✅ Handle remote stream
          peerConnection.current.ontrack = (event) => {
            console.log("[DEBUG] Remote stream received:", event.streams[0]);
            remoteVideo.current.srcObject = event.streams[0];
          };

          // ✅ Handle ICE candidates
          peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
              console.log("[DEBUG] Sending ICE candidate:", event.candidate);
              socket.emit("signal", { candidate: event.candidate });
            }
          };

          // ✅ Handle incoming signals
          socket.on("signal", async ({ data }) => {
            console.log("[DEBUG] Signal received:", data);

            if (data.sdp) {
              await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
              console.log("[DEBUG] Remote SDP set:", data.sdp.type);

              if (data.sdp.type === "offer") {
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);
                socket.emit("signal", { sdp: peerConnection.current.localDescription });
                console.log("[DEBUG] Sent answer");
              }
            } else if (data.candidate) {
              try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log("[DEBUG] Added ICE candidate");
              } catch (err) {
                console.error("[ERROR] Adding ICE candidate:", err);
              }
            }
          });

          // ✅ Create and send offer (only if not already set)
          if (!peerConnection.current.currentRemoteDescription) {
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            socket.emit("signal", { sdp: peerConnection.current.localDescription });
            console.log("[DEBUG] Sent offer");
          }
        });

        socket.on("partner-disconnected", () => {
          setStatus("Partner disconnected. Refresh to find a new one.");
          console.log("[DEBUG] Partner disconnected");
          if (peerConnection.current) peerConnection.current.close();
        });
      } catch (err) {
        console.error("[ERROR] Could not access camera/mic:", err);
        setStatus("Error: Could not access camera/mic");
      }
    };

    start();
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h1>{status}</h1>
      <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "20px" }}>
        <video ref={localVideo} autoPlay playsInline muted width="300" style={{ border: "2px solid black" }} />
        <video ref={remoteVideo} autoPlay playsInline width="300" style={{ border: "2px solid black" }} />
      </div>
      <p style={{ marginTop: "20px", fontSize: "14px", color: "gray" }}>
        Open this page in two different devices or tabs to test.
        Check browser console logs (F12) for debug info.
      </p>
    </div>
  );
}

export default App;
