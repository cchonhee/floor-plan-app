import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Sparkles,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dimensions, setDimensions] = useState([]);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImageSrc(dataUrl);

      const base64 = dataUrl.split(",")[1];
      setBase64Data(base64);
      setImageMimeType(file.type);
      setDimensions([]);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!base64Data) {
      setError("도면 이미지를 업로드해주세요.");
      return;
    }

    setIsProcessing(true);
    setError("");

    let apiKey = "";
    const modelName = "gemini-2.5-flash";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!apiKey || apiKey.trim() === "") {
      setError(
        `🚨 오류: API 키가 설정되지 않았습니다. Vercel 환경 변수를 다시 확인해 주세요.`,
      );
      setIsProcessing(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야.\n\n1단계: 도면의 축척을 파악해.\n\n2단계: 도면에 적힌 모든 '방 이름(용도)'을 찾아내고, 각 방의 가로(W), 세로(H) 길이를 계산해.\n\n3단계 (단위 변환): 계산된 길이는 mm가 아닌 **미터(m) 단위로 소수점 첫째 자리까지** 변환해 (예: 3600mm -> 3.6m). W, H 접두사 없이 숫자와 m만 남겨!\n\n4단계 (위치 및 중복 방지): 동일한 방은 1번만 출력해. X, Y 좌표(0~100) 규칙:\n- **공간이 좁은 방들 (창고, 화장실, 탈의실, 세면실, 숙직실 등):** 도면의 **가장 왼쪽 바깥 여백 (X좌표 약 10~15% 부근)**으로 X좌표를 확 빼버려. Y좌표는 해당 방의 높이에 맞춰.\n- **공간이 넓은 방들 (매점, 시설관리실, 탁구장 등):** 도면에 적힌 방 이름 글씨의 가로 중앙(X)에 맞추고, Y좌표는 글씨 바로 위쪽에 배치해.`,
            },
            {
              inlineData: {
                mimeType: imageMimeType || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: "너는 도면 치수 계산 및 UI 배치 전문가야. 치수는 무조건 '3.6m' 처럼 미터 단위로만 출력해. 좁은 방은 왼쪽 바깥으로 X좌표를 빼고, 넓은 방은 방 이름 위에 배치해. JSON 형식으로만 응답해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            dimensions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: {
                    type: "STRING",
                    description: "방 이름 (예: 화장실)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "가로 길이 (예: 2.4m)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "세로 길이 (예: 2.4m)",
                  },
                  x: { type: "NUMBER", description: "X 좌표 백분율" },
                  y: { type: "NUMBER", description: "Y 좌표 백분율" },
                },
                required: ["roomName", "widthText", "heightText", "x", "y"],
              },
            },
          },
          required: ["dimensions"],
        },
      },
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`상태 코드: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsedResult = JSON.parse(responseText);

          const uniqueDimensions = [];
          const seenRooms = new Set();

          (parsedResult.dimensions || []).forEach((dim) => {
            if (
              dim.widthText &&
              !dim.widthText.includes("N/A") &&
              dim.roomName &&
              !seenRooms.has(dim.roomName)
            ) {
              seenRooms.add(dim.roomName);
              uniqueDimensions.push(dim);
            }
          });

          setDimensions(uniqueDimensions);
          setIsProcessing(false);
          return;
        } else {
          throw new Error("결과를 찾을 수 없습니다.");
        }
      } catch (err) {
        if (attempt === delays.length) {
          setError(
            "오류가 발생했습니다. 잠시 후 다시 시도해주세요. " + err.message,
          );
          setIsProcessing(false);
          return;
        }
        await sleep(delays[attempt]);
      }
    }
  };

  // [핵심 변경] 캔버스에 그릴 때 상자 안에 '방 이름'을 명찰처럼 달아줍니다!
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (dimensions && dimensions.length > 0) {
        // 글씨 크기를 약간 키워서 잘 보이게 설정
        const fontSize = Math.max(11, Math.floor(canvas.width * 0.01));

        dimensions.forEach((dim) => {
          const centerX = (dim.x / 100) * canvas.width;
          const centerY = (dim.y / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";
          const rName = dim.roomName || "방"; // 방 이름 가져오기

          // 방 이름과 수치 중 가장 긴 텍스트를 기준으로 상자 너비 계산
          ctx.font = `900 ${fontSize * 1.05}px sans-serif`;
          const rWidth = ctx.measureText(rName).width;
          ctx.font = `bold ${fontSize * 0.95}px sans-serif`;
          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;

          const maxWidth = Math.max(wWidth, hWidth, rWidth);
          const paddingX = fontSize * 1.0;
          const boxWidth = maxWidth + paddingX * 2;

          // 방 이름 1줄 + 수치 2줄 = 총 3줄이 들어갈 넉넉한 높이
          const boxHeight = fontSize * 3.8;

          // 1. 하얀색 말풍선 상자 그리기
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(
              centerX - boxWidth / 2,
              centerY - boxHeight / 2,
              boxWidth,
              boxHeight,
              6,
            );
          } else {
            ctx.rect(
              centerX - boxWidth / 2,
              centerY - boxHeight / 2,
              boxWidth,
              boxHeight,
            );
          }
          ctx.fill();

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#2563eb";
          ctx.stroke();

          // 2. 방 이름과 수치를 구분하는 얇은 가로선 긋기 (디자인 포인트!)
          ctx.beginPath();
          ctx.moveTo(centerX - boxWidth / 2 + 6, centerY - fontSize * 0.3);
          ctx.lineTo(centerX + boxWidth / 2 - 6, centerY - fontSize * 0.3);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(37, 99, 235, 0.3)"; // 연한 파란색 선
          ctx.stroke();

          // 3. 텍스트 입력 (방 이름은 위쪽에 진하게, 수치는 아래쪽에)
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // 방 이름 (명찰)
          ctx.fillStyle = "#1e3a8a"; // 아주 진한 남색
          ctx.font = `900 ${fontSize * 1.05}px sans-serif`;
          ctx.fillText(rName, centerX, centerY - fontSize * 1.1);

          // 수치 데이터
          ctx.fillStyle = "#2563eb"; // 쨍한 파란색
          ctx.font = `bold ${fontSize * 0.95}px sans-serif`;
          ctx.fillText(wText, centerX, centerY + fontSize * 0.4);
          ctx.fillText(hText, centerX, centerY + fontSize * 1.4);
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, dimensions]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_수치완성.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[90vh]">
        <div className="bg-linear-to-r from-indigo-600 to-blue-500 p-6 text-white">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-indigo-200" />
            도면 수치 자동 입력기
          </h1>
          <p className="text-indigo-100 text-sm mt-2 font-medium opacity-90">
            AI가 도면을 읽고 방 크기를 계산해 줍니다.
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-slate-700 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-3 text-indigo-400 group-hover:text-indigo-600 transition-colors duration-300">
                <Camera className="w-10 h-10" />
                <UploadCloud className="w-10 h-10" />
              </div>
              <span className="text-sm text-slate-500 font-semibold text-center">
                터치하여 사진 촬영
                <br />
                또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                : "bg-linear-to-r from-indigo-600 to-blue-500 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI가 도면을 분석 중입니다...
              </>
            ) : (
              "수치 계산 및 도면에 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1">
            <label className="font-bold text-slate-700 text-lg">
              결과 미리보기
            </label>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center flex-1 min-h-[250px]">
              {!imageSrc ? (
                <div className="text-slate-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지를 업로드하면 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {dimensions.length > 0 && (
            <button
              onClick={downloadImage}
              className="mt-2 w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors duration-300 shadow-md"
            >
              <Download className="w-5 h-5" />
              결과 이미지 갤러리에 저장하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
