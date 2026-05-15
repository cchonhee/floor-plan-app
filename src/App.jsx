import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Download, AlertCircle, Loader2, Camera, UploadCloud, Frame } from 'lucide-react';

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImageSrc(dataUrl);
      
      const base64 = dataUrl.split(',')[1];
      setBase64Data(base64);
      setImageMimeType(file.type);
      // 새 이미지를 업로드하면 기존 결과를 초기화하여 분석 버튼을 다시 활성화합니다.
      setAnalysisResult(null); 
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
    
    // 💡 [가장 확실하고 쉬운 해결책] Vercel 환경변수가 계속 적용 안 되는 문제를 100% 우회합니다.
    // 아래의 빈 따옴표 안에 발급받으신 구글 API 키(AIzaSy... 로 시작하는 문자열)를 직접 복사해서 붙여넣으세요!
    // 예시: let finalApiKey = "AIzaSy... (내 키) ...";
    let finalApiKey = "AIzaSyAQqsNhMmnZVRmxi7hupa1mfPkEZme6UeE"; 
    
    let modelName = "gemini-1.5-flash"; 

    try {
      // 직접 입력한 키가 없으면 환경변수에서 가져오기 시도
      if (!finalApiKey && typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
        finalApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    // 그래도 키가 없으면 우측 캔버스(미리보기) 테스트 환경용 모델 적용
    if (!finalApiKey) {
      modelName = "gemini-2.5-flash-preview-09-2025"; 
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${finalApiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: `다음은 건축 평면도 이미지야. 다중 도면(여러 층)을 모두 찾아 독립적으로 분석해.\n\n**[앱의 궁극적 목적 및 측정 객체(Measurement Object) 정의]**\n건축 CAD(Computer-Aided Design - 컴퓨터 지원 설계) 표준에서 '측정 객체'란 치수를 잴 대상을 말해. 이 도면에서 너의 유일한 측정 객체는 **"가는 붉은색 실선으로 채워진 방을 감싸고 있는 '굵은 붉은색 계열(빨강, 분홍, 마젠타 등) 실선'"**이야.\n\n**치수보조선은 오직 이 '굵은 붉은색 실선' 위에서만 시작되어야 해!** 단, 방별로 벽 길이를 따로 재기 위해 이 굵은 선은 다음 두 가지 엄격한 기점 규칙에 의해서만 여러 개의 선분 조각으로 쪼개져야 해.\n\n[기점 규칙 1 - 기본] 굵은 붉은선이 꺾이는 부분(방의 코너): 치수보조선은 반드시 "굵은 붉은선의 정가운데(두께 중심)"에서 나온다.\n[기점 규칙 2 - 예외] 방과 방을 나누는 검은색 실선 교차점: 굵은 붉은선이 일직선이더라도, 교실이나 음악실 등 방과 방을 나누는 '검은색 실선(또는 겹쳐진 실선)'과 굵은 붉은선이 직각으로 만난다면 무조건 잘라야 해! 이때는 예외적으로 그 "검은색 실선의 정가운데(두께 중심)"에서 치수보조선이 나온다.\n\n**[절대 금지 사항]**: 규칙 1과 규칙 2에 해당하지 않는 장소(복도, 가는 붉은선 위, 텅 빈 허공 등)에서는 절대로 치수보조선을 뽑지 마!\n\n**1단계 (면적 & 비율):** 평면도별 기준 면적(area), 거대 직사각형 가로/세로 백분율(totalW, totalH), 실제 붉은 구역이 꽉 찬 비율(fillFactor) 추출.\n\n**2단계 (측정 객체 분할 추출):** 위 목적과 기점 규칙에 따라 쪼개진 각 '측정 객체(굵은 붉은색 선분 조각)'에 대해 다음을 추출해.\n- orientation: ('horizontal' 또는 'vertical')\n- position: 도면 바깥 방향 ('top', 'bottom', 'left', 'right')\n- x1, y1: 쪼개진 측정 객체의 시작 기점 좌표 백분율 (반드시 규칙 1, 2에 해당하는 픽셀 위치)\n- x2, y2: 쪼개진 측정 객체의 끝 기점 좌표 백분율 (반드시 규칙 1, 2에 해당하는 픽셀 위치)` },
          { inlineData: { mimeType: imageMimeType || "image/jpeg", data: base64Data } }
        ]
      }],
      systemInstruction: {
        parts: [{ text: "너는 건축 CAD 도면 분석가야. 치수보조선은 오직 측정 객체인 '굵은 붉은색(마젠타 포함) 실선'에서만 나와야 하며(규칙 1), 방을 나누는 벽체일 때만 예외적으로 '검은색 실선'에서 나온다(규칙 2). 이 2가지 경우를 제외한 어떤 곳(복도, 허공 등)에서도 절대 치수선의 기점(x, y)을 잡지 마라. 이 규칙을 엄격하게 지켜 쪼개진 벽면 선분들의 양 끝점 좌표를 JSON(JavaScript Object Notation)으로 출력해." }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            plans: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  planName: { type: "STRING" },
                  area: { type: "NUMBER" },
                  totalW: { type: "NUMBER" },
                  totalH: { type: "NUMBER" },
                  fillFactor: { type: "NUMBER", description: "거대 직사각형 면적 대비 실제 붉은 구역 꽉 찬 비율" },
                  segments: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        orientation: { type: "STRING" },
                        position: { type: "STRING" },
                        x1: { type: "NUMBER", description: "측정 객체(굵은 붉은선)의 시작 기점 X 좌표 (반드시 규칙 1, 2 위치)" },
                        y1: { type: "NUMBER", description: "측정 객체(굵은 붉은선)의 시작 기점 Y 좌표 (반드시 규칙 1, 2 위치)" },
                        x2: { type: "NUMBER", description: "측정 객체(굵은 붉은선)의 끝 기점 X 좌표 (반드시 규칙 1, 2 위치)" },
                        y2: { type: "NUMBER", description: "측정 객체(굵은 붉은선)의 끝 기점 Y 좌표 (반드시 규칙 1, 2 위치)" }
                      },
                      required: ["orientation", "position", "x1", "y1", "x2", "y2"]
                    }
                  }
                },
                required: ["planName", "area", "totalW", "totalH", "fillFactor", "segments"]
              }
            }
          },
          required: ["plans"]
        }
      }
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          // [업데이트] 구글 서버의 정확한 에러 메시지를 가로채서 화면에 표시합니다.
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`[상태 코드 ${response.status}] ${errorData.error?.message || '구글 서버 응답 오류'}`);
        }
        
        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (responseText) {
          const parsedResult = JSON.parse(responseText);
          if (parsedResult.plans && parsedResult.plans.length > 0) {
            setAnalysisResult(parsedResult);
          }
          setIsProcessing(false);
          return; 
        } else {
          throw new Error("결과를 찾을 수 없습니다.");
        }
      } catch (err) {
        if (attempt === delays.length) {
          setError(`🚨 구글 AI 통신 에러: ${err.message}\n\n💡 [해결법] Vercel 빌드 문제로 API 키가 빈 값으로 전송되고 있습니다. App.jsx 코드의 44번째 줄 부근 'finalApiKey = ""' 부분의 따옴표 안에 구글 API 키를 직접 붙여넣고 깃허브에 다시 올려주시면 100% 해결됩니다!`);
          setIsProcessing(false);
          return;
        }
        await sleep(delays[attempt]);
      }
    }
  };

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (analysisResult && analysisResult.plans) {
        const fontSize = Math.max(13, Math.floor(canvas.width * 0.012)); 
        const drawnTextBoxes = [];

        const checkCollision = (box1) => {
          return drawnTextBoxes.some(box2 => {
            return !(box1.right < box2.left || 
                     box1.left > box2.right || 
                     box1.bottom < box2.top || 
                     box1.top > box2.bottom);
          });
        };

        analysisResult.plans.forEach(plan => {
          if (!plan.segments || plan.segments.length === 0) return;

          const fillFactor = plan.fillFactor || 0.8; 
          const pxTotalW = (plan.totalW / 100) * canvas.width;
          const pxTotalH = (plan.totalH / 100) * canvas.height;
          const bbPixelArea = pxTotalW * pxTotalH;
          const bbRealArea = plan.area / fillFactor;
          
          const uniformScale = Math.sqrt(bbRealArea / bbPixelArea);

          plan.segments.forEach((seg) => {
            let pxX1 = (seg.x1 / 100) * canvas.width;
            let pxY1 = (seg.y1 / 100) * canvas.height;
            let pxX2 = (seg.x2 / 100) * canvas.width;
            let pxY2 = (seg.y2 / 100) * canvas.height;

            if (seg.orientation === 'horizontal') {
              const avgY = (pxY1 + pxY2) / 2;
              pxY1 = pxY2 = avgY;
              if (pxX1 > pxX2) { let t = pxX1; pxX1 = pxX2; pxX2 = t; }
            } else {
              const avgX = (pxX1 + pxX2) / 2;
              pxX1 = pxX2 = avgX;
              if (pxY1 > pxY2) { let t = pxY1; pxY1 = pxY2; pxY2 = t; }
            }

            const pxLen = seg.orientation === 'horizontal' ? Math.abs(pxX2 - pxX1) : Math.abs(pxY2 - pxY1);
            const realLength = pxLen * uniformScale;
            
            if(realLength < 0.1) return; 

            const prefix = seg.orientation === 'horizontal' ? 'W: ' : 'H: ';
            const text = `${prefix}${realLength.toFixed(1)}m`;

            const cx = (pxX1 + pxX2) / 2;
            const cy = (pxY1 + pxY2) / 2;

            const offset = Math.max(18, canvas.width * 0.018); 
            const gap = 0; 
            const overrun = 10; 
            const tickSize = 5; 

            ctx.save();
            const drawColor = "#2563eb"; 
            ctx.strokeStyle = drawColor; 
            ctx.fillStyle = drawColor;
            ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(text).width;

            if (seg.orientation === 'horizontal') {
              const isTop = seg.position === 'top';
              
              const yLine = isTop ? cy - offset : cy + offset;
              const extStart = isTop ? cy - gap : cy + gap; 
              const extEnd = isTop ? yLine - overrun : yLine + overrun;

              ctx.beginPath();
              ctx.moveTo(pxX1, extStart); ctx.lineTo(pxX1, extEnd);
              ctx.moveTo(pxX2, extStart); ctx.lineTo(pxX2, extEnd);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(pxX1, yLine); ctx.lineTo(pxX2, yLine);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(pxX1 - tickSize, yLine + tickSize); ctx.lineTo(pxX1 + tickSize, yLine - tickSize);
              ctx.moveTo(pxX2 - tickSize, yLine + tickSize); ctx.lineTo(pxX2 + tickSize, yLine - tickSize);
              ctx.stroke();

              let textY = isTop ? yLine - fontSize * 0.8 : yLine + fontSize * 0.8;
              let box = {
                left: cx - tw/2 - 6, right: cx + tw/2 + 6,
                top: textY - fontSize/2 - 4, bottom: textY + fontSize/2 + 4
              };

              let shiftCount = 0;
              while (checkCollision(box) && shiftCount < 5) {
                textY += isTop ? -(fontSize * 1.5) : (fontSize * 1.5);
                box.top = textY - fontSize/2 - 4;
                box.bottom = textY + fontSize/2 + 4;
                shiftCount++;
              }
              drawnTextBoxes.push(box);

              if (shiftCount > 0) {
                const originalTextY = isTop ? yLine - fontSize * 0.8 : yLine + fontSize * 0.8;
                ctx.beginPath();
                ctx.moveTo(cx, originalTextY);
                ctx.lineTo(cx, isTop ? box.bottom : box.top);
                ctx.setLineDash([3, 3]); 
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]); 
                ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));
              }

              ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
              ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
              
              ctx.fillStyle = drawColor; 
              ctx.fillText(text, cx, textY);

            } else {
              const isLeft = seg.position === 'left';
              
              const xLine = isLeft ? cx - offset : cx + offset;
              const extStart = isLeft ? cx - gap : cx + gap;
              const extEnd = isLeft ? xLine - overrun : xLine + overrun;

              ctx.beginPath();
              ctx.moveTo(extStart, pxY1); ctx.lineTo(extEnd, pxY1);
              ctx.moveTo(extStart, pxY2); ctx.lineTo(extEnd, pxY2);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(xLine, pxY1); ctx.lineTo(xLine, pxY2);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(xLine - tickSize, pxY1 + tickSize); ctx.lineTo(xLine + tickSize, pxY1 - tickSize);
              ctx.moveTo(xLine - tickSize, pxY2 + tickSize); ctx.lineTo(xLine + tickSize, pxY2 - tickSize);
              ctx.stroke();

              let textX = isLeft ? xLine - tw/2 - 8 : xLine + tw/2 + 8;
              let box = {
                left: textX - tw/2 - 6, right: textX + tw/2 + 6,
                top: cy - fontSize/2 - 4, bottom: cy + fontSize/2 + 4
              };

              let shiftCount = 0;
              while (checkCollision(box) && shiftCount < 5) {
                textX += isLeft ? -(tw * 0.8) : (tw * 0.8);
                box.left = textX - tw/2 - 6;
                box.right = textX + tw/2 + 6;
                shiftCount++;
              }
              drawnTextBoxes.push(box);

              if (shiftCount > 0) {
                const originalTextX = isLeft ? xLine - tw/2 - 8 : xLine + tw/2 + 8;
                ctx.beginPath();
                ctx.moveTo(xLine, cy);
                ctx.lineTo(isLeft ? box.right : box.left, cy);
                ctx.setLineDash([3, 3]); 
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]); 
                ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002));
              }

              ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
              ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
              
              ctx.fillStyle = drawColor; 
              ctx.fillText(text, textX, cy);
            }
            ctx.restore();
          });
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, analysisResult]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = '평면도_측정객체_정밀분석.png';
    link.href = dataUrl;
    link.click();
  };

  // 분석 버튼 비활성화 조건: 이미지가 없거나, 분석 중이거나, 이미 결과가 나왔을 때
  const isButtonDisabled = !imageSrc || isProcessing || analysisResult !== null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans p-4 sm:p-8 flex justify-center items-start">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col min-h-[85vh]">
        
        <div className="px-8 pt-8 pb-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3 text-zinc-900">
            <Frame className="w-6 h-6 text-zinc-900" />
            방별 외곽 벽면 치수 계산기
          </h1>
          <p className="text-zinc-500 text-sm mt-2.5 font-medium leading-relaxed">
            측정 객체(붉은선/마젠타선)와 기점 규칙을 엄격히 통제합니다.
          </p>
        </div>

        <div className="px-8 pb-8 pt-4 flex flex-col gap-6 flex-1">
          
          <div className="flex flex-col gap-3">
            <label className="font-bold text-zinc-800 text-lg">1. 평면도 업로드</label>
            <label className="group border-2 border-dashed border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-400 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden" 
              />
              <div className="flex gap-4 mb-4 text-zinc-400 group-hover:text-zinc-600 transition-colors duration-200">
                <Camera className="w-8 h-8" />
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="text-sm text-zinc-500 font-medium text-center">
                터치하여 사진 촬영 또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 whitespace-pre-line">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button 
            onClick={analyzeImage}
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
              isButtonDisabled 
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-md hover:shadow-lg hover:-translate-y-0.5'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                오직 굵은 붉은색(마젠타 포함) 선을 규칙에 따라 분석 중...
              </>
            ) : analysisResult ? (
              '✅ 계산 완료 (새 도면을 올리면 다시 활성화됩니다)'
            ) : (
              '2. 각 방별 외곽 벽면 길이 계산 및 그리기'
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1 mt-2">
            <h2 className="text-sm font-bold text-zinc-800 tracking-wide">결과 미리보기</h2>
            <div className="bg-zinc-50/80 rounded-2xl border border-zinc-200 overflow-hidden flex items-center justify-center flex-1 min-h-[300px]">
              {!imageSrc ? (
                <div className="text-zinc-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span className="text-sm font-medium">이미지가 여기에 표시됩니다.</span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas 
                    ref={canvasRef} 
                    className="w-full h-auto block rounded-xl shadow-sm border border-zinc-100"
                  />
                </div>
              )}
            </div>
          </div>
          
          {analysisResult && (
            <button 
              onClick={downloadImage}
              className="mt-1 w-full py-3.5 rounded-xl font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center gap-2 transition-all duration-200"
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