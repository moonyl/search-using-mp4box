import React, { Component } from "react";
import "./App.css";
import MP4Box, { Log, DataStream } from "mp4box";
import { Readable } from "stream";

function concatTypedArrays(a, b) {
  // a, b TypedArray of same type
  var c = new a.constructor(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

let mp4boxfile;
let video;

function onUpdateEnd(isNotInit, isEndOfAppend) {
  if (isEndOfAppend === true) {
    if (isNotInit === true) {
      updateBufferedString(this, "Update ended");
    }
    if (this.sampleNum) {
      mp4boxfile.releaseUsedSamples(this.id, this.sampleNum);
      delete this.sampleNum;
    }
    if (this.is_last) {
      this.ms.endOfStream();
    }
  }
  console.log("onUpdateEnd, this: ", this);
  console.log("ms.readyState: ", this.ms.readyState);
  console.log("updating: ", this.updating);
  console.log("pendingAppends: ", this.pendingAppends.length);

  if (this.ms.readyState === "open" && this.updating === false && this.pendingAppends.length > 0) {
    var obj = this.pendingAppends.shift();
    Log.info(
      "MSE - SourceBuffer #" + this.id,
      "Appending new buffer, pending: " + this.pendingAppends.length
    );
    this.sampleNum = obj.sampleNum;
    this.is_last = obj.is_last;
    console.log("appendBuffer");
    this.appendBuffer(obj.buffer);
  }
}

const updateBufferedString = (sb, string) => {
  var rangeString;
  if (sb.ms.readyState === "open") {
    rangeString = Log.printRanges(sb.buffered);
    Log.info(
      "MSE - SourceBuffer #" + sb.id,
      string +
        ", updating: " +
        sb.updating +
        ", currentTime: " +
        Log.getDurationString(video.currentTime, 1) +
        ", buffered: " +
        rangeString +
        ", pending: " +
        sb.pendingAppends.length
    );
    // if (sb.bufferTd === undefined) {
    //   sb.bufferTd = document.getElementById("buffer" + sb.id);
    // }
    // sb.bufferTd.textContent = rangeString;
  }
};

class App extends Component {
  constructor(props) {
    super(props);
    this.autoplay = false;
    this.initAllButton = false;
    this.video = React.createRef();
    //console.log(this.video.current);
    //this.reset();
  }

  componentDidMount() {
    console.log(this.video.current);
    video = this.video.current;
    this.reset();
  }

  play = () => {
    //this.video = document.getElementById("v");
    console.log(this.video.current);
    //const video = this.video.current;
    video.play();
    this.load();
  };

  onSourceOpen = e => {
    var ms = e.target;
    Log.info("MSE", "Source opened");
    Log.debug("MSE", ms);
  };

  onSourceClose = e => {
    var ms = e.target;
    if (ms.video.error) {
      Log.error("MSE", "Source closed, video error: " + ms.video.error.code);
    } else {
      Log.info("MSE", "Source closed, no error");
    }
  };

  resetMediaSource = () => {
    //let video = this.video.current;
    //if (video.ms) return;

    var mediaSource;
    mediaSource = new MediaSource();
    mediaSource.video = video;
    video.ms = mediaSource;
    mediaSource.addEventListener("sourceopen", this.onSourceOpen);
    mediaSource.addEventListener("sourceclose", this.onSourceClose);
    video.src = window.URL.createObjectURL(mediaSource);
  };

  reset = () => {
    this.resetMediaSource();
  };

  addBuffer = (video, mp4track) => {
    var sb;
    var ms = video.ms;
    var track_id = mp4track.id;
    var codec = mp4track.codec;
    var mime = 'video/mp4; codecs="' + codec + '"';

    if (MediaSource.isTypeSupported(mime)) {
      try {
        Log.info("MSE - SourceBuffer #" + track_id, "Creation with type '" + mime + "'");
        sb = ms.addSourceBuffer(mime);
        sb.addEventListener("error", function(e) {
          Log.error("MSE SourceBuffer #" + track_id, e);
        });
        sb.ms = ms;
        sb.id = track_id;

        //nbSamples is customizable
        mp4boxfile.setSegmentOptions(track_id, sb, {
          nbSamples: 1000
        });
        sb.pendingAppends = [];
      } catch (e) {
        Log.error(
          "MSE - SourceBuffer #" + track_id,
          "Cannot create buffer with type '" + mime + "'" + e
        );
      }
    } else {
      Log.warn(
        "MSE",
        "MIME type '" +
          mime +
          "' not supported for creation of a SourceBuffer for track id " +
          track_id
      );
    }
  };

  addSourceBufferListener = info => {
    console.log("this: ", this);
    //let video = this.video.current;
    for (var i = 0; i < info.tracks.length; i++) {
      var track = info.tracks[i];
      this.addBuffer(video, track);
    }
  };

  onInitAppended = e => {
    var sb = e.target;
    if (sb.ms.readyState === "open") {
      updateBufferedString(sb, "Init segment append ended");
      sb.sampleNum = 0;
      sb.removeEventListener("updateend", this.onInitAppended);
      sb.addEventListener("updateend", onUpdateEnd.bind(sb, true, true));
      /* In case there are already pending buffers we call onUpdateEnd to start appending them*/
      onUpdateEnd.call(sb, false, true);
      sb.ms.pendingInits--;
      if (sb.ms.pendingInits === 0) {
        this.start();
      }
    }
  };

  saveBuffer = (buffer, name) => {
    // if (saveChecked.checked) {
    //   var d = new DataStream(buffer);
    //   d.save(name);
    // }
  };

  initializeSourceBuffers = () => {
    console.log("initializeSourceBuffers");
    var initSegs = mp4boxfile.initializeSegmentation();
    console.log([initSegs]);
    for (var i = 0; i < initSegs.length; i++) {
      var sb = initSegs[i].user;
      console.log({ sb });
      if (i === 0) {
        sb.ms.pendingInits = 0;
      }
      sb.addEventListener("updateend", this.onInitAppended);
      //console.log("after add listener updateend");
      Log.info("MSE - SourceBuffer #" + sb.id, "Appending initialization data");
      sb.appendBuffer(initSegs[i].buffer);
      console.log("after append buffer");
      this.saveBuffer(initSegs[i].buffer, "track-" + initSegs[i].id + "-init.mp4");
      console.log("after savebuffer");
      sb.segmentIndex = 0;
      sb.ms.pendingInits++;
    }
  };

  initializeAllSourceBuffers = () => {
    if (this.movieInfo) {
      this.initializeSourceBuffers();
    }
  };

  start = () => {
    mp4boxfile.start();
  };

  load = () => {
    fetch("http://localhost:3000/sample-video")
      .then(response => {
        const reader = response.body.getReader();
        return new Readable({
          read(size) {
            reader.read().then(({ done, value }) => {
              if (done) {
                this.push(null);
              }
              this.push(value);
            });
          }
        });
      })
      .then(streamer => {
        let context = this;
        //let ms = this.video.current.ms;
        let ms = video.ms;
        mp4boxfile = MP4Box.createFile();
        //console.log("out this: ", this);

        mp4boxfile.onMoovStart = function() {
          Log.info("Application", "Starting to parse movie information");
        };
        mp4boxfile.onReady = function(info) {
          //Log.info("Application", "Movie information received: ", info);
          //console.log("info: ", info);
          //movieInfo = info;
          if (info.isFragmented) {
            ms.duration = info.fragment_duration / info.timescale;
            console.log(info.fragment_duration / info.timescale);
          } else {
            ms.duration = info.duration / info.timescale;
            console.log(info.duration / info.timescale);
          }
          //displayMovieInfo(info, infoDiv);
          //console.log("this: ", this);
          context.movieInfo = info;
          context.addSourceBufferListener(info);
          //stop();
          context.initializeAllSourceBuffers();
          //if (this.autoplay) {
          //initializeAllSourceBuffers();
          //} else {
          //this.initAllButton.disabled = false;
          //}
        };
        mp4boxfile.onSegment = function(id, user, buffer, sampleNum, is_last) {
          console.log("check, onSegment");
          var sb = user;
          context.saveBuffer(buffer, "track-" + id + "-segment-" + sb.segmentIndex + ".m4s");
          sb.segmentIndex++;
          sb.pendingAppends.push({
            id: id,
            buffer: buffer,
            sampleNum: sampleNum,
            is_last: is_last
          });
          Log.info(
            "Application",
            "Received new segment for track " +
              id +
              " up to sample #" +
              sampleNum +
              ", segments pending append: " +
              sb.pendingAppends.length
          );
          onUpdateEnd.call(sb, true, false);
        };

        let nextStart = 0;
        streamer.on("data", chunk => {
          let buf = chunk.buffer;
          buf.fileStart = nextStart;
          mp4boxfile.appendBuffer(buf);
          nextStart += chunk.length;
          console.log("chunk length: ", chunk.length);
        });
      })
      .catch(err => console.error(err));
  };

  render() {
    return (
      <div>
        <video ref={this.video} controls />
        <button onClick={this.play}>Play</button>
      </div>
    );
  }
}

export default App;
