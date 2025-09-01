import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

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
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.current.srcObject = localStream;

        // When waiting
        socket.on("waiting", () => setStatus("Waiting for a partner..."));

        // When paired
        socket.on("partner-found", async () => {
          setStatus("Connected!");

          peerConnection.current = new RTCPeerConnection();

          // Add local stream tracks
          localStream.getTracks().forEach(track =>
            peerConnection.current.addTrack(track, localStream)
          );

          // Show remote stream
          peerConnection.current.ontrack = (event) => {
            remoteVideo.current.srcObject = event.streams[0];
          };

          // Send ICE candidates
          peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit("signal", { candidate: event.candidate });
            }
          };

          // Handle signals
          socket.on("signal", async ({ data }) => {
            if (data.sdp) {
              await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
              if (data.sdp.type === "offer") {
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);
                socket.emit("signal", { sdp: peerConnection.current.localDescription });
              }
            } else if (data.candidate) {
              try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error("Error adding ICE candidate", err);
              }
            }
          });

          // Only create offer if this client initiated connection
          if (!peerConnection.current.currentRemoteDescription) {
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            socket.emit("signal", { sdp: peerConnection.current.localDescription });
          }
        });

        socket.on("partner-disconnected", () => {
          setStatus("Partner disconnected. Refresh to find a new one.");
          if (peerConnection.current) peerConnection.current.close();
        });
      } catch (err) {
        console.error("Error accessing media devices.", err);
        setStatus("Error: could not access camera/mic");
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
    </div>
  );
}

export default App;
