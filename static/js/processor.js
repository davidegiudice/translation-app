class MyWorkletProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        for (let channel = 0; channel < output.length; ++channel) {
            output[channel].set(input[channel]);
        }
        return true;
    }
}

registerProcessor('my-worklet-processor', MyWorkletProcessor);
