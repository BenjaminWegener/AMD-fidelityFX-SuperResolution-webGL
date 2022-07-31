const WIDTH = 640;
const HEIGHT = 360;

const glsl = x => x;
const frag = glsl`
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// FidelityFX FSR v1.0.2 by AMD
// ported to mpv by agyild

// Changelog
// Made it compatible with pre-OpenGL 4.0 renderers
// Made it directly operate on LUMA plane, since the original shader was operating on LUMA by deriving it from RGB. This should cause a major increase in performance, especially on OpenGL 4.0+ renderers (4+2 texture lookups vs. 12+5)
// Removed transparency preservation mechanism since the alpha channel is a separate source plane than LUMA
// Added optional performance-saving lossy optimizations to EASU (Credit: atyuwen, https://atyuwen.github.io/posts/optimizing-fsr/)
// 
// Notes
// Per AMD's guidelines only upscales content up to 4x (e.g., 1080p -> 2160p, 720p -> 1440p etc.) and everything else in between,
// that means FSR will scale up to 4x at maximum, and any further scaling will be processed by mpv's scalers


#define SHARPENING 1.0 // Sharpening intensity: Adjusts sharpening intensity by averaging the original pixels to the sharpened result. 1.0 is the unmodified default. 0.0 to 1.0.
#define CONTRAST 1.0 // Adjusts the range the shader adapts to high contrast (0 is not all the way off). Higher values = more high contrast sharpening. 0.0 to 1.0.

precision highp float;

uniform float width;
uniform float height;
uniform float texWidth;
uniform float texHeight;

float width_half;

uniform sampler2D camTexture;


float sinc(float x)
{
    return sin(x * 3.1415926535897932384626433) / (x * 3.1415926535897932384626433); 
}
float lanczosWeight(float d, float n)
{
    return (d == 0.0) ? (1.0) : (d*d < n*n ? sinc(d) * sinc(d / n) : 0.0);
}
vec3 Lanczos3(vec2 uv, vec2 InvResolution)
{
    vec2 center = uv - (mod(uv / InvResolution, 1.0)-0.5) * InvResolution;// texel center
    vec2 offset = (uv - center)/InvResolution;// relevant texel position in the range -0.5～+0.5
    
    vec3 col = vec3(0,0,0);
    float weight = 0.0;
    for(int x = -3; x < 3; x++){
    for(int y = -3; y < 3; y++){
        
        float wx = lanczosWeight(float(x)-offset.x, 3.0);
        float wy = lanczosWeight(float(y)-offset.y, 3.0);
        float w = wx * wy;
        
        col += w * texture2D(camTexture, center + vec2(x,y) * InvResolution).rgb;
        weight += w;
    }
    }
    col /= weight;
    
    return col;
}


void main() {
	width_half = width / 2.0;
	vec2 coord = 1.0 - gl_FragCoord.xy / vec2(width, height);
	vec4 e = texture2D(camTexture, coord);
	
	if (gl_FragCoord.x > width_half){
        //vec2 InvResolution = 1.0 / vec2(texWidth, texHeight);	
		vec2 InvResolution = 1.0 / vec2(width, height);	
		e = vec4(Lanczos3(coord, InvResolution), 1);
		
		// fetch a 3x3 neighborhood around the pixel 'e',
		//  a b c
		//  d(e)f
		//  g h i	
		vec2 a_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0, -1.0)) / vec2(width, height);
		vec4 a_tex = texture2D(camTexture, a_coord);
		vec3 a = a_tex.rgb;
		vec2 b_coord =  1.0 - (gl_FragCoord.xy + vec2( 0.0, -1.0)) / vec2(width, height);
		vec4 b_tex = texture2D(camTexture, b_coord);
		vec3 b = b_tex.rgb;
		vec2 c_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0, -1.0)) / vec2(width, height);
		vec4 c_tex = texture2D(camTexture, c_coord);
		vec3 c = c_tex.rgb;
		vec2 f_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0,  0.0)) / vec2(width, height);
		vec4 f_tex = texture2D(camTexture, f_coord);
		vec3 f = f_tex.rgb;
		vec2 g_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0,  1.0)) / vec2(width, height);
		vec4 g_tex = texture2D(camTexture, g_coord);
		vec3 g = g_tex.rgb;
		vec2 h_coord =  1.0 - (gl_FragCoord.xy + vec2( 0.0,  1.0)) / vec2(width, height);
		vec4 h_tex = texture2D(camTexture, h_coord);
		vec3 h = h_tex.rgb;
		vec2 d_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0,  0.0)) / vec2(width, height);
		vec4 d_tex = texture2D(camTexture, d_coord);
		vec3 d = d_tex.rgb;
		vec2 i_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0,  1.0)) / vec2(width, height);
		vec4 i_tex = texture2D(camTexture, i_coord);
		vec3 i = i_tex.rgb;

		//biliniear filtering
		//e.rgb = (e.rgb + a + b + c + d + f + g + h + i) / 9.0;	

		// Soft min and max.
		//  a b c			b
		//  d e f * 0.5	+ d e f * 0.5
		//  g h i			h
		// These are 2.0x bigger (factored out the extra multiply).

		vec3 mnRGB = min(min(min(d, e.rgb), min(f, b)), h);
		vec3 mnRGB2 = min(mnRGB, min(min(a, c), min(g, i)));
		mnRGB += mnRGB2;

		vec3 mxRGB = max(max(max(d, e.rgb), max(f, b)), h);
		vec3 mxRGB2 = max(mxRGB, max(max(a, c), max(g, i)));
		mxRGB += mxRGB2;

		// Smooth minimum distance to signal limit divided by smooth max.
		vec3 rcpMRGB = 1.0 / mxRGB;
		vec3 ampRGB = clamp(min(mnRGB, 2.0 - mxRGB) * rcpMRGB, 0.0, 1.0);

		// Shaping amount of sharpening.
		ampRGB = inversesqrt(ampRGB);

		float peak = -3.0 * clamp(CONTRAST, 0.0, 1.0) + 8.0;
		vec3 wRGB = -(1.0 / (ampRGB * peak));

		vec3 rcpWeightRGB = 1.0 / (4.0 * wRGB + 1.0);

		//					0 w 0
		//  Filter shape:	w 1 w
		//					0 w 0
		vec3 window = (b + d) + (f + h);
		vec3 outColor = clamp((window * wRGB + e.rgb) * rcpWeightRGB, 0.0, 1.0);

		gl_FragColor = vec4(mix(e.rgb, outColor, SHARPENING), e.a);
	}
	else gl_FragColor = e;
	
	if (gl_FragCoord.x > width_half - 1.0 && gl_FragCoord.x < width_half + 1.0) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`

const vert = glsl`
precision mediump float;
attribute vec2 position;

void main () {
  gl_Position = vec4(position, 0, 1.0);
}
`

let video = document.querySelector('video');
let fallbackImage = null;

let camTexture = null;

const glea = new GLea({
  glOptions: {
    preserveDrawingBuffer: true
  },
  shaders: [
    GLea.fragmentShader(frag),
    GLea.vertexShader(vert)
  ],
  buffers: {
    'position': GLea.buffer(2, [1, 1, -1, 1, 1, -1, -1, -1])
  }
}).create();

window.addEventListener('resize', () => {
  glea.resize();
  console.log(glea.width);
});

function loop(time) {
  const { gl } = glea;
  // Upload the image into the texture.
  if (video) {
    glea.setActiveTexture(0, camTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);  
  }
  
  glea.clear();
  glea.uni('width', glea.width);
  glea.uni('height', glea.height);
  glea.uni('texWidth', WIDTH);
  glea.uni('texHeight', HEIGHT);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(loop);
}

function accessWebcam(video) {
  return new Promise((resolve, reject) => {
    const mediaConstraints = { audio: false, video: { width: {ideal: WIDTH}, height: {ideal: HEIGHT}, brightness: {ideal: 2} } };
    navigator.mediaDevices.getUserMedia(mediaConstraints).then(mediaStream => {
      video.srcObject = mediaStream;
      video.setAttribute('playsinline', true);
      video.onloadedmetadata = (e) => {
        video.play();
        resolve(video);
      }
    }).catch(err => {
      reject(err);
    });
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(img);
    };
  });
}

function takeScreenshot() {
  const { canvas } = glea;
  const anchor = document.createElement('a');
  anchor.setAttribute('download', 'selfie.jpg');
  anchor.setAttribute('href', canvas.toDataURL('image/jpeg', 0.92));
  anchor.click();
}

async function setup() {
  const { gl } = glea;
  try {
    await accessWebcam(video);
  } catch (ex) {
    video = null;
    console.error(ex.message);
  }
  // video = null;
  if (! video) {
    try {
      fallbackImage = await loadImage('https://placekitten.com/1280/720')
    } catch (ex) {
      console.error(ex.message);
      return false;
    }
  }

  camTexture = glea.createTexture(0);
  // Upload the image into the texture.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video || fallbackImage);
  
  glea.setActiveTexture(0, camTexture);

  glea.uniI('camTexture', 0);
  loop(0);
}

setup();
