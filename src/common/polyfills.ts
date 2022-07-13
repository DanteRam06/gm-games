// Comments indicate where I'd have to bump minimum supported browser versions to get rid of these.

// Chrome 54
// Inlined from MDN, since object.entries and object.values npm packages were somehow adding 50kb to each bundle
if (!Object.entries) {
	Object.entries = (obj: any) => {
		const ownProps = Object.keys(obj);
		let i = ownProps.length;
		const resArray = new Array(i); // preallocate the Array

		while (i--) {
			resArray[i] = [ownProps[i], obj[ownProps[i]]];
		}

		return resArray;
	};
}
if (!Object.values) {
	Object.values = (obj: any) => {
		const ownProps = Object.keys(obj);
		let i = ownProps.length;
		const resArray = new Array(i); // preallocate the Array

		while (i--) {
			resArray[i] = obj[ownProps[i]];
		}

		return resArray;
	};
}

// Chrome 69, Safari 12
// https://github.com/behnammodi/polyfill/blob/1a5965edc0e2eaf8e6d87902cc719462e2a889fb/array.polyfill.js#L598-L622
if (!Array.prototype.flat) {
	Object.defineProperty(Array.prototype, "flat", {
		configurable: true,
		writable: true,
		value: function () {
			const depth =
				// eslint-disable-next-line prefer-rest-params
				typeof arguments[0] === "undefined" ? 1 : Number(arguments[0]) || 0;
			const result: any[] = [];
			const forEach = result.forEach;

			const flatDeep = function (arr: any[], depth: number) {
				forEach.call(arr, function (val) {
					if (depth > 0 && Array.isArray(val)) {
						flatDeep(val, depth - 1);
					} else {
						result.push(val);
					}
				});
			};

			flatDeep(this, depth);
			return result;
		},
	});
}

import {
	CountQueuingStrategy as PolyfillCountQueuingStrategy,
	ReadableStream as PolyfillReadableStream,
	TransformStream as PolyfillTransformStream,
	WritableStream as PolyfillWritableStream,
} from "web-streams-polyfill/ponyfill/es6";
import {
	createReadableStreamWrapper,
	createTransformStreamWrapper,
} from "@mattiasbuelens/web-streams-adapter";

// It's all or nothing for stream polyfills, because native methods return native streams which do not play nice with the polyfill streams.
const POLYFILL_STREAMS = !self.WritableStream || !self.TransformStream;
export let toPolyfillReadable: (stream: ReadableStream) => ReadableStream;
export let toPolyfillTransform: (stream: TransformStream) => TransformStream;
if (POLYFILL_STREAMS) {
	// Chrome 67, Firefox 102, Safari 14.1 (those are for TransformStream, which was the last implemented in some browsers, so that's the cutoff for removing all of these polyfills)
	self.ReadableStream = PolyfillReadableStream as any;
	self.TransformStream = PolyfillTransformStream as any;
	self.WritableStream = PolyfillWritableStream;

	toPolyfillReadable = createReadableStreamWrapper(
		PolyfillReadableStream,
	) as any;
	toPolyfillTransform = createTransformStreamWrapper(
		PolyfillTransformStream as any,
	) as any;
} else {
	toPolyfillReadable = x => x;
	toPolyfillTransform = x => x;
}

// Chrome 59
if (self.CountQueuingStrategy === undefined) {
	self.CountQueuingStrategy = PolyfillCountQueuingStrategy;
}

import "./polyfills-modern";
